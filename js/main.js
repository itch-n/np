// ============================================================================
// Imports
// ============================================================================

import { createDropShadowFilter, createInsetShadowFilter } from './svgFilters.js';

// ============================================================================
// Configuration
// ============================================================================

const MAP_CONFIG = {
  width: 900,
  height: 500,
  simulationIterations: 5,
  parkRadius: {
    lower48: 14,
    others: 10
  },
  shadow: {
    blur: 2,
    offsetX: 0,
    offsetY: 2,
    opacity: 0.3
  },
  fade: {
    opacity: 0.25,
    hueRotation: 60,
    saturation: 0.6,
    brightness: 1.1
  }
};

// Featured parks derived from visits.json
let featuredParks = new Set();

// Overseas parks (Alaska, Hawaii, Virgin Islands) - smaller radius
const osParks = ["dena", "gaar", "glba", "katm", "npsa", "hale", "havo",
  "kefj", "lacl", "wrst", "kova", "viis"];

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
 * Determines if a park is featured (visited)
 */
function isFeatured(parkCode) {
  return featuredParks.has(parkCode);
}

/**
 * Renders park images on the map
 */
function renderParkImages(map, nodes, config) {
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
    .attr('filter', d => isFeatured(d.parkCode) ? 'url(#drop-shadow)' : 'url(#inset-shadow)')
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

  return { tooltip, tipImg, tipName };
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

  const flipX = (x + tipW > window.innerWidth - padding);
  const flipY = (y + tipH > window.innerHeight - padding);

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
  d3.select('body').on('touchend.tooltip', function() {
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
  .scale(MAP_CONFIG.width)
  .translate([MAP_CONFIG.width / 2, MAP_CONFIG.height / 2.2]);

const path = d3.geoPath().projection(projection);

// Create SVG container
const svg = d3.select("#content")
  .append("svg")
  .attr('id', 'map')
  .attr('viewBox', `0 0 ${MAP_CONFIG.width} ${MAP_CONFIG.height}`)
  .attr('preserveAspectRatio', 'xMidYMid meet');

// Create SVG filters
const defs = svg.append('defs');
createDropShadowFilter(defs, MAP_CONFIG);
createInsetShadowFilter(defs, MAP_CONFIG);

// Create map group
const map = svg.append('g').attr('class', 'map');

// Load data and render
Promise.all([
  d3.json("https://unpkg.com/us-atlas@3.0.0/states-10m.json"),
  d3.json("./data/parks.json"),
  d3.json("./data/visits.json")
]).then(([usa, places, visits]) => {
  // Populate featured parks from visits data
  featuredParks = new Set(visits.map(v => v.parkCode));

  // Draw map layers
  drawBaseMap(map, usa, path);
  drawStateBorders(map, usa, path);

  // Process park data
  const nodes = createParkNodes(places, projection, MAP_CONFIG);
  runForceSimulation(nodes, MAP_CONFIG);

  // Render park images
  const images = renderParkImages(map, nodes, MAP_CONFIG);

  // Wait for all park images to load before animating map in
  const imageNodes = images.nodes();
  let loadedCount = 0;
  const totalImages = imageNodes.length;

  function checkAllImagesLoaded() {
    loadedCount++;
    if (loadedCount === totalImages) {
      // All images loaded, trigger map animation
      svg.classed('loaded', true);
    }
  }

  imageNodes.forEach(img => {
    if (img.complete) {
      // Image already loaded (cached)
      checkAllImagesLoaded();
    } else {
      // Wait for image to load
      img.addEventListener('load', checkAllImagesLoaded);
      img.addEventListener('error', checkAllImagesLoaded); // Count errors as "loaded" to not block animation
    }
  });

  // Setup tooltip
  const { tooltip, tipImg, tipName } = createTooltip();
  const touchState = { active: false, currentTarget: null };

  setupMouseInteractions(images, tooltip, tipImg, tipName, touchState);
  setupTouchInteractions(images, tooltip, tipImg, tipName, touchState);
});

// ============================================================================
// Parks Counter
// ============================================================================

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
  const duration = 1500; // 1.5 seconds
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
function renderVisitsTable(visits, parksLookup) {
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
      .on('error', function() {
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
      .attr('alt', d => parksLookup[d.parkCode] || d.parkCode)
      .on('error', function() {
        d3.select(this).attr('src', PLACEHOLDER_IMAGE);
      });

    // Add content container
    const content = wrapper.append('div')
      .attr('class', 'visit-card__content');

    // Add park name
    content.append('div')
      .attr('class', 'visit-card__park')
      .text(d => parksLookup[d.parkCode] || d.parkCode);

    // Add date
    content.append('div')
      .attr('class', 'visit-card__date')
      .text(d => formatDate(d.date));
  });
}

/**
 * Loads visits data and renders the table
 */
function loadVisitsTable() {
  Promise.all([
    d3.json('./data/parks.json'),
    d3.json('./data/visits.json')
  ])
    .then(([parks, visits]) => {
      // Create lookup map: parkCode -> shortened park name with state
      const parksLookup = {};
      parks.forEach(park => {
        parksLookup[park.parkCode] = `${shortenParkName(park.name)}, ${park.state}`;
      });

      // Update parks counter
      updateParksCounter(visits);

      renderVisitsTable(visits, parksLookup);
    })
    .catch(error => {
      console.log('Error loading data:', error);
      d3.select('#visits-table').html(NO_VISITS_MESSAGE);
    });
}

// Load visits table
loadVisitsTable();

