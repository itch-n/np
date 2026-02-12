// ============================================================================
// Imports
// ============================================================================

import {createInsetShadowFilter} from './svgFilters.js';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  width: 900,
  height: 500,
  simulationIterations: 5,
  parkRadius: {
    lower48: 16,
    others: 10
  },
  animationDuration: 1500 // Duration in ms for counter and reveal animations
};

// ============================================================================
// Map Rendering Functions
// ============================================================================

/**
 * Draws the base US map outline
 */
function drawBaseMap(map, usa, path) {
  map.selectAll('path')
    .data(topojson.feature(usa, usa.objects.nation).features)
    .enter().append("path")
    .attr("d", path)
    .attr("class", "outline");
}

/**
 * Draws state borders
 */
function drawStateBorders(map, usa, path) {
  map.append("path")
    .datum(topojson.mesh(usa, usa.objects.states, (a, b) => a !== b))
    .attr("class", "mesh")
    .attr("d", path);
}

/**
 * Converts park data to positioned nodes using projection
 */
function createParkNodes(places, projection, config) {
  return places.map(d => {
    const coords = projection([+d.longitude, +d.latitude]);
    if (!coords) return null;

    // Overseas parks (Alaska, Hawaii, Virgin Islands) - smaller radius
    const osParks = ["dena", "gaar", "glba", "katm", "npsa", "hale", "havo",
      "kefj", "lacl", "wrst", "kova", "viis"];
    const radius = osParks.includes(d.parkCode)
      ? config.parkRadius.others
      : config.parkRadius.lower48;

    return {
      ...d,
      r: radius,
      px: coords[0],
      py: coords[1],
      x: coords[0],
      y: coords[1]
    };
  }).filter(Boolean);
}

/**
 * Runs force simulation to prevent park icon overlaps
 */
function runForceSimulation(nodes, config) {
  const sim = d3.forceSimulation(nodes)
    .force('x', d3.forceX(d => d.px))
    .force('y', d3.forceY(d => d.py))
    .force('collide', d3.forceCollide().radius(d => d.r))
    .stop();

  for (let i = 0; i < config.simulationIterations; i++) {
    sim.tick();
  }
}

/**
 * Renders park images on the map
 */
function renderParkImages(map, nodes, visits) {
  // Create set of featured parks (parks that have been visited)
  const featuredParks = new Set(visits.map(v => v.parkCode));

  const images = map.selectAll('image.place')
    .data(nodes)
    .enter()
    .append('image')
    .attr('width', d => d.r * 2)
    .attr('height', d => d.r * 2)
    .attr('x', d => d.x - d.r)
    .attr('y', d => d.y - d.r)
    .attr('href', d => `img/np/${d.parkCode}.png`)
    .attr('preserveAspectRatio', 'xMidYMid slice')
    .attr('filter', 'url(#inset-shadow)') // ALL parks start with inset shadow
    .classed('place', true)
    .classed('featured', d => featuredParks.has(d.parkCode)) // Mark featured parks for later reveal
    .on('error', function () {
      d3.select(this).attr('visibility', 'hidden');
    });

  return images;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Shortens park name by removing "National Park" and variations
 */
function shortenParkName(name) {
  return name
    .replace(/\s+National Park(?:\s+&\s+Preserve)?$/i, '')
    .replace(/\s+National\s+and\s+State\s+Parks$/i, '');
}

/**
 * Waits for all images in a D3 selection to load
 */
function waitForImages(images) {
  return new Promise(resolve => {
    const imageNodes = images.nodes();
    let loadedCount = 0;
    const totalImages = imageNodes.length;

    function checkComplete() {
      loadedCount++;
      if (loadedCount === totalImages) {
        resolve();
      }
    }

    imageNodes.forEach(img => {
      if (img.complete) {
        checkComplete();
      } else {
        img.addEventListener('load', checkComplete);
        img.addEventListener('error', checkComplete);
      }
    });
  });
}

/**
 * Waits for an element's CSS transition to complete
 */
function waitForTransition(element, propertyName) {
  return new Promise(resolve => {
    function handleTransitionEnd(e) {
      if (e.propertyName === propertyName && e.target === element) {
        element.removeEventListener('transitionend', handleTransitionEnd);
        resolve();
      }
    }

    element.addEventListener('transitionend', handleTransitionEnd);
  });
}

// ============================================================================
// Tooltip Functions
// ============================================================================

/**
 * Creates tooltip DOM structure
 */
function createTooltip() {
  const tooltip = d3.select('body').append('div').attr('class', 'tooltip');
  const tooltipContent = tooltip.append('div').attr('class', 'tooltip__content');
  const tipImg = tooltipContent.append('img').attr('alt', 'preview');
  const tipName = tooltipContent.append('div').attr('class', 'tooltip__name');

  return {tooltip, tipImg, tipName};
}

/**
 * Shows tooltip with park information
 */
function showTooltip(tooltip, tipImg, tipName, parkData) {
  tipImg.attr('src', `img/np/${parkData.parkCode}.png`);
  tipName.text(`${shortenParkName(parkData.name)}, ${parkData.state}`);
  tooltip.style('display', 'block');
}

/**
 * Positions tooltip based on cursor/touch position
 */
function positionTooltip(tooltip, x, y, padding = 0) {
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
function hideTooltip(tooltip) {
  tooltip.style('display', 'none');
}

/**
 * Sets up mouse hover interactions
 */
function setupMouseInteractions(images, tooltip, tipImg, tipName, touchState) {
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
function setupTouchInteractions(images, tooltip, tipImg, tipName, touchState) {
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

// ============================================================================
// Main Initialization
// ============================================================================

// Initialize projection
const projection = geoAlbersUsaTerritories.geoAlbersUsaTerritories()
  .scale(CONFIG.width)
  .translate([CONFIG.width / 2, CONFIG.height / 2.2]);

const path = d3.geoPath().projection(projection);

// Create SVG container
const svg = d3.select("#content")
  .append("svg")
  .attr('id', 'map')
  .attr('viewBox', `0 0 ${CONFIG.width} ${CONFIG.height}`)
  .attr('preserveAspectRatio', 'xMidYMid meet');

// Create SVG filters
const defs = svg.append('defs');
// createDropShadowFilter(defs, MAP_CONFIG); // Not currently used
createInsetShadowFilter(defs, CONFIG);

// Create map group
const map = svg.append('g').attr('class', 'map');

// Load data and render
Promise.all([
  d3.json("https://unpkg.com/us-atlas@3.0.0/states-10m.json"),
  d3.json("./data/parks.json"),
  d3.json("./data/visits.json")
]).then(async ([usa, parks, visits]) => {
  // Draw map layers
  drawBaseMap(map, usa, path);
  drawStateBorders(map, usa, path);

  // Render visits table
  renderVisitsTable(visits, parks);

  // Process park data
  const nodes = createParkNodes(parks, projection, CONFIG);
  runForceSimulation(nodes, CONFIG);

  // Render park images
  const images = renderParkImages(map, nodes, visits);

  // Animation sequence: wait for images → fade in map → reveal
  await waitForImages(images);
  svg.classed('loaded', true);

  await waitForTransition(svg.node(), 'opacity');

  // Start synchronized animations
  animateChronologicalReveal(images, visits);
  updateParksCounter(visits);

  // Setup tooltip
  const {tooltip, tipImg, tipName} = createTooltip();
  const touchState = {active: false, currentTarget: null};

  setupMouseInteractions(images, tooltip, tipImg, tipName, touchState);
  setupTouchInteractions(images, tooltip, tipImg, tipName, touchState);
});

// ============================================================================
// Parks Counter
// ============================================================================

/**
 * Animates chronological reveal of visited parks synchronized with counter
 */
function animateChronologicalReveal(images, visits) {
  if (!visits || visits.length === 0) return;

  // Sort visits chronologically (oldest first)
  const sortedVisits = [...visits].sort((a, b) => new Date(a.date) - new Date(b.date));

  // Get unique park codes in chronological order (first visit only)
  const seenParks = new Set();
  const chronologicalParks = sortedVisits
    .filter(v => {
      if (seenParks.has(v.parkCode)) return false;
      seenParks.add(v.parkCode);
      return true;
    })
    .map(v => v.parkCode);

  const totalParks = chronologicalParks.length;
  const duration = CONFIG.animationDuration;
  const individualDuration = 200; // Duration for each park's bounce animation
  const startTime = performance.now();

  // Create a lookup map for faster park image access
  const parkImageMap = new Map();
  images.each(function(d) {
    parkImageMap.set(d.parkCode, {
      element: d3.select(this),
      data: d
    });
  });

  // Track the last processed index to avoid redundant iteration
  let lastProcessedIndex = 0;

  // Track all currently animating parks in a single array
  const animatingParks = [];

  function easeOutElastic(t) {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  }

  function easeInQuad(t) {
    return t * t;
  }

  // Single animation loop that updates ALL animating parks
  function updateAnimatingParks(currentTime) {
    // Update all parks that are currently animating
    for (let i = animatingParks.length - 1; i >= 0; i--) {
      const parkAnim = animatingParks[i];
      const localElapsed = currentTime - parkAnim.startTime;
      const localProgress = Math.min(localElapsed / individualDuration, 1);
      const scale = easeOutElastic(localProgress);

      parkAnim.park.element.attr('transform',
        `translate(${parkAnim.cx}, ${parkAnim.cy}) scale(${scale}) translate(${-parkAnim.cx}, ${-parkAnim.cy})`);

      // Remove from array if animation is complete
      if (localProgress >= 1) {
        parkAnim.park.element.attr('transform', null);
        animatingParks.splice(i, 1);
      }
    }

    // Continue if there are still parks animating
    if (animatingParks.length > 0) {
      requestAnimationFrame(updateAnimatingParks);
    }
  }

  function animateReveal(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Apply ease-in easing to the overall progress
    const easedProgress = easeInQuad(progress);
    const currentIndex = Math.floor(easedProgress * totalParks);

    // Reveal only NEW parks since last frame (optimization: avoid redundant iteration)
    for (let i = lastProcessedIndex; i < currentIndex; i++) {
      const parkCode = chronologicalParks[i];

      // Get the park image element and its data from the lookup map
      const park = parkImageMap.get(parkCode);

      if (park) {
        const cx = park.data.x;
        const cy = park.data.y;

        // Remove the inset shadow filter immediately
        park.element.attr('filter', '');

        // Add to animating parks array
        animatingParks.push({
          park,
          cx,
          cy,
          startTime: currentTime
        });

        // Start the unified animation loop if not already running
        if (animatingParks.length === 1) {
          requestAnimationFrame(updateAnimatingParks);
        }
      }
    }

    // Update the last processed index
    lastProcessedIndex = currentIndex;

    if (progress < 1) {
      requestAnimationFrame(animateReveal);
    } else {
      // Ensure all parks are revealed at the end
      for (let i = lastProcessedIndex; i < totalParks; i++) {
        const parkCode = chronologicalParks[i];
        const park = parkImageMap.get(parkCode);
        if (park) {
          park.element.attr('filter', '');
          park.element.attr('transform', null);
        }
      }
    }
  }

  requestAnimationFrame(animateReveal);
}

/**
 * Updates the parks visited counter in the header with an animated count-up
 */
function updateParksCounter(visits) {
  const counterElement = d3.select('.top__counter-visited');

  if (!visits || visits.length === 0) {
    counterElement.text('0');
    return;
  }

  // Count unique park codes
  const uniqueParks = new Set(visits.map(v => v.parkCode));
  const targetCount = uniqueParks.size;

  // Animate counter from 0 to target
  const duration = CONFIG.animationDuration;
  const startTime = performance.now();

  function easeInQuad(t) {
    return t * t;
  }

  function animateCount(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Apply ease-in easing
    const easedProgress = easeInQuad(progress);
    const currentCount = Math.floor(easedProgress * targetCount);

    counterElement.text(currentCount);

    if (progress < 1) {
      requestAnimationFrame(animateCount);
    } else {
      // Ensure we end exactly at target
      counterElement.text(targetCount);

      // Trigger flourish animation
      counterElement.classed('complete', true);

      // Remove class after animation completes to allow re-triggering
      setTimeout(() => {
        counterElement.classed('complete', false);
      }, 700);
    }
  }

  requestAnimationFrame(animateCount);
}

// ============================================================================
// Visits Table
// ============================================================================

// Constants
const NO_VISITS_MESSAGE = '<p style="color: #666;">No visits recorded yet.</p>';
const PLACEHOLDER_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect fill="%23eee" width="80" height="80"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999" font-size="12"%3ENo Image%3C/text%3E%3C/svg%3E';

/**
 * Formats a date string to a readable format
 * @param {string} dateString - Date string in ISO format (YYYY-MM-DD)
 * @returns {string} Formatted date string
 */
function formatDate(dateString) {
  // Ensure consistent UTC parsing across all browsers
  // Date-only strings (YYYY-MM-DD) are parsed differently by browsers
  // Appending 'T00:00:00Z' forces UTC interpretation
  const normalizedDate = dateString.includes('T') ? dateString : `${dateString}T00:00:00Z`;
  const date = new Date(normalizedDate);

  // Validate date is valid
  if (isNaN(date.getTime())) {
    console.warn(`Invalid date string: ${dateString}`);
    return dateString; // Return original string if parsing fails
  }

  // Use UTC to avoid timezone shifting the date
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
}

/**
 * Renders the visits table
 */
function renderVisitsTable(visits, parks) {
  // Create lookup function
  function getParkName(parkCode) {
    const park = parks.find(p => p.parkCode === parkCode);
    return park ? `${shortenParkName(park.name)}, ${park.state}` : parkCode;
  }

  const container = d3.select('#visits-table');

  if (!visits || visits.length === 0) {
    container.html(NO_VISITS_MESSAGE);
    return;
  }

  // Sort visits by date (most recent first)
  const sortedVisits = visits.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Group visits by year
  const visitsByYear = {};
  sortedVisits.forEach(visit => {
    const year = new Date(visit.date).getFullYear();
    if (!visitsByYear[year]) {
      visitsByYear[year] = [];
    }
    visitsByYear[year].push(visit);
  });

  // Get years in descending order
  const years = Object.keys(visitsByYear).sort((a, b) => b - a);

  // Render each year group
  years.forEach(year => {
    // Add year group container
    const yearGroup = container.append('div')
      .attr('class', 'visits-year-group');

    // Create grid for this year
    const grid = yearGroup.append('div')
      .attr('class', 'visits-grid');

    // Add year image card as first item in grid
    const yearImageCard = grid.append('div')
      .attr('class', 'card year-image-card');

    yearImageCard.append('img')
      .attr('class', 'year-image-card__image')
      .attr('src', `./img/years/${year}.svg`)
      .attr('alt', `${year} highlight`)
      .on('error', function () {
        d3.select(this.parentNode).style('display', 'none');
      });

    // Create cards for all visits
    const cards = grid.selectAll('.visit-card')
      .data(visitsByYear[year])
      .enter()
      .append('div')
      .attr('class', 'card visit-card')
      .style('--visit-bg-image', d => (d.visitImage && d.visitImage !== 'null') ? `url('${d.visitImage}')` : 'none');

    // Add wrapper for image and content
    const wrapper = cards.append('div')
      .attr('class', 'visit-card__wrapper');

    // Add cancellation image
    wrapper.append('img')
      .attr('class', 'visit-card__image')
      .attr('src', d => d.cancellationImage)
      .attr('alt', d => getParkName(d.parkCode))
      .on('error', function () {
        d3.select(this).attr('src', PLACEHOLDER_IMAGE);
      });

    // Add content container
    const content = wrapper.append('div')
      .attr('class', 'visit-card__content');

    // Add park name
    content.append('div')
      .attr('class', 'visit-card__park')
      .text(d => getParkName(d.parkCode));

    // Add date
    content.append('div')
      .attr('class', 'visit-card__date')
      .text(d => formatDate(d.date));
  });
}

