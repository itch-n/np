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

  return {tooltip, tipImg, tipName};
}

/**
 * Shows tooltip with park information
 */
export function showTooltip(tooltip, tipImg, tipName, parkData) {
  tipImg.attr('src', `img/np/${parkData.parkCode}.png`);
  tipName.text(`${shortenParkName(parkData.name)}, ${parkData.state}`);
  tooltip.style('display', 'block');
}

/**
 * Positions tooltip based on cursor/touch position
 */
export function positionTooltip(tooltip, x, y, padding = 0) {
  const tipNode = tooltip.node();
  const tipW = tipNode.offsetWidth;
  const tipH = tipNode.offsetHeight;

  // Use visual viewport when available (accounts for zoom on mobile)
  const vv = window.visualViewport;
  const viewportWidth = vv ? vv.width : window.innerWidth;
  const viewportHeight = vv ? vv.height : window.innerHeight;
  const offsetX = vv ? vv.offsetLeft : 0;
  const offsetY = vv ? vv.offsetTop : 0;

  // Adjust coordinates relative to visual viewport
  const relativeX = x - offsetX;
  const relativeY = y - offsetY;

  const flipX = (relativeX + tipW > viewportWidth - padding);
  const flipY = (relativeY + tipH > viewportHeight - padding);

  tooltip
    .style('--tx', `${x}px`)
    .style('--ty', `${y}px`)
    .classed('flip-x', flipX)
    .classed('flip-y', flipY);
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
export function setupMouseInteractions(images, tooltip, tipImg, tipName, touchState) {
  images
    .on('mouseover', (event, d) => {
      if (!touchState.active) {
        showTooltip(tooltip, tipImg, tipName, d);
      }
    })
    .on('mousemove', (event) => {
      if (!touchState.active) {
        positionTooltip(tooltip, event.clientX, event.clientY);
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
export function setupTouchInteractions(images, tooltip, tipImg, tipName, touchState) {
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

    showTooltip(tooltip, tipImg, tipName, d);

    const touch = event.touches[0];
    tooltip.style('display', 'block'); // Show first to get dimensions
    positionTooltip(tooltip, touch.clientX, touch.clientY, 10);
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
