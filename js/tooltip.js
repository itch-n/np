// ============================================================================
// Tooltip Module
// ============================================================================
// Handles all tooltip creation, positioning, and interaction logic for park images

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Shortens park name by removing "National Park" and variations
 */
export function shortenParkName(name) {
  return name
    .replace(/\s+National Park(?:\s+&\s+Preserve)?$/i, '')
    .replace(/\s+National\s+and\s+State\s+Parks$/i, '');
}

// ============================================================================
// Tooltip Core Functions
// ============================================================================

/**
 * Creates tooltip DOM structure
 */
export function createTooltip() {
  const tooltip = d3.select('body').append('div').attr('class', 'tooltip');
  const tooltipContent = tooltip.append('div').attr('class', 'tooltip__content');
  const tipImg = tooltipContent.append('img').attr('alt', 'preview');
  const tipName = tooltipContent.append('div').attr('class', 'tooltip__name');
  const tipDates = tooltipContent.append('div').attr('class', 'tooltip__dates');

  return {tooltip, tipImg, tipName, tipDates};
}

/**
 * Shows tooltip with park information
 */
export function showTooltip(tooltip, tipImg, tipName, tipDates, parkData, visits) {
  tipImg.attr('src', `img/np/${parkData.parkCode}.png`);
  tipName.text(`${shortenParkName(parkData.name)}, ${parkData.state}`);

  const parkVisits = (visits || [])
    .filter(v => v.parkCode === parkData.parkCode)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (parkVisits.length) {
    const fmt = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    tipDates.style('display', null).html('');
    parkVisits.forEach(v => tipDates.append('span').text(fmt(v.date)));
  } else {
    tipDates.style('display', 'none');
  }

  tooltip.style('display', 'block');
}

/**
 * Positions tooltip anchored to the given DOM element
 */
export function positionTooltip(tooltip, element, padding = 0) {
  const tipNode = tooltip.node();
  const tipW = tipNode.offsetWidth;
  const tipH = tipNode.offsetHeight;

  const rect = element.getBoundingClientRect();
  const vv = window.visualViewport;
  const viewportWidth = vv ? vv.width : window.innerWidth;
  const viewportHeight = vv ? vv.height : window.innerHeight;
  // getBoundingClientRect is in layout-viewport coords; position:fixed uses
  // visual-viewport coords — subtract the visual viewport's offset to reconcile
  const ox = vv ? vv.offsetLeft : 0;
  const oy = vv ? vv.offsetTop : 0;

  let x = rect.right - ox + 4;
  let y = rect.top - oy;

  if (x + tipW > viewportWidth - padding) x = rect.left - ox - tipW - 4;
  if (y + tipH > viewportHeight - padding) y = rect.bottom - oy - tipH;

  // Clamp so the tooltip always stays fully on screen
  x = Math.max(padding, Math.min(x, viewportWidth - tipW - padding));
  y = Math.max(padding, Math.min(y, viewportHeight - tipH - padding));

  tooltip
    .style('left', `${x}px`)
    .style('top', `${y}px`);
}

/**
 * Hides tooltip
 */
export function hideTooltip(tooltip) {
  tooltip.style('display', 'none');
}

// ============================================================================
// Interaction Setup Functions
// ============================================================================

/**
 * Sets up mouse hover interactions
 */
export function setupMouseInteractions(images, tooltip, tipImg, tipName, tipDates, visits, touchState) {
  images
    .on('mouseover', (event, d) => {
      if (!touchState.active) {
        showTooltip(tooltip, tipImg, tipName, tipDates, d, visits);
        positionTooltip(tooltip, event.currentTarget);
      }
    })
    .on('mouseout', () => {
      if (!touchState.active) {
        hideTooltip(tooltip);
      }
    });
}

/**
 * Sets up touch interactions for mobile devices
 */
export function setupTouchInteractions(images, tooltip, tipImg, tipName, tipDates, visits, touchState) {
  images.on('touchstart', (event, d) => {
    event.preventDefault();
    event.stopPropagation();

    touchState.active = true;
    const currentImage = d3.select(event.currentTarget);

    // Toggle tooltip if tapping same element
    if (touchState.currentTarget === event.currentTarget) {
      hideTooltip(tooltip);
      currentImage.attr('transform', null); // Remove scale
      touchState.currentTarget = null;
      touchState.active = false;
      return;
    }

    // Reset previous image transform
    if (touchState.currentTarget) {
      d3.select(touchState.currentTarget).attr('transform', null);
    }

    // Show tooltip for new element
    touchState.currentTarget = event.currentTarget;

    // Add scale transform for visual feedback
    const x = +currentImage.attr('x') + (+currentImage.attr('width') / 2);
    const y = +currentImage.attr('y') + (+currentImage.attr('height') / 2);
    currentImage.attr('transform', `translate(${x}, ${y}) scale(1.15) translate(${-x}, ${-y})`);

    showTooltip(tooltip, tipImg, tipName, tipDates, d, visits);

    tooltip.style('display', 'block'); // Show first to get dimensions
    positionTooltip(tooltip, event.currentTarget, 10);
  });

  // Hide tooltip when tapping outside
  d3.select('body').on('touchstart.tooltip', function (event) {
    if (!event.target.closest('image.place')) {
      hideTooltip(tooltip);
      if (touchState.currentTarget) {
        d3.select(touchState.currentTarget).attr('transform', null);
      }
      touchState.currentTarget = null;
      touchState.active = false;
    }
  });

  // Prevent mouse events from firing after touch
  // Note: Mobile browsers often fire mouse events 300-500ms after touchend
  // We use requestAnimationFrame to defer the state reset until after
  // any synthetic mouse events have been processed
  d3.select('body').on('touchend.tooltip', function () {
    // Use requestAnimationFrame for better timing than arbitrary setTimeout
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Double RAF ensures we're past any synthetic mouse events
        if (touchState.active && tooltip.style('display') !== 'none') {
          touchState.active = false;
        }
      });
    });
  });
}
