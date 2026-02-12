// ============================================================================
// Imports
// ============================================================================

import {createInsetShadowFilter, createDropShadowFilter} from './svgFilters.js';
import {createTooltip, setupMouseInteractions, setupTouchInteractions, shortenParkName} from './tooltip.js';

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
  animationDuration: 1500, // Duration in ms for counter and reveal animations
  animationStartDelay: 300 // Delay in ms before starting reveal animation
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
    .force('collide', d3.forceCollide().radius(d => d.r + 1))
    .stop();

  for (let i = 0; i < config.simulationIterations; i++) {
    sim.tick();
  }
}

/**
 * Renders park images on the map
 */
function renderParkImages(map, nodes, visits) {
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
    .attr('filter', 'url(#inset-shadow)') // All parks start with inset shadow
    .classed('place', true)
    .on('error', function () {
      d3.select(this).attr('visibility', 'hidden');
    });

  return images;
}

// ============================================================================
// Utility Functions
// ============================================================================

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
createInsetShadowFilter(defs, CONFIG);
createDropShadowFilter(defs, CONFIG);

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

  // Animation sequence: wait for images → reveal
  await waitForImages(images);

  // Setup tooltip immediately
  const {tooltip, tipImg, tipName} = createTooltip();
  const touchState = {active: false, currentTarget: null};

  setupMouseInteractions(images, tooltip, tipImg, tipName, touchState);
  setupTouchInteractions(images, tooltip, tipImg, tipName, touchState);

  // Wait before starting reveal animation
  setTimeout(() => {
    animateChronologicalReveal(images, visits);
  }, CONFIG.animationStartDelay);
});

// ============================================================================
// Parks Counter
// ============================================================================

/**
 * Animates chronological reveal of visited parks synchronized with counter
 * @returns {Promise} Resolves when animation completes
 */
function animateChronologicalReveal(images, visits) {
  return new Promise(resolve => {
    const counterElement = d3.select('.top__counter-visited');

    if (!visits || visits.length === 0) {
      counterElement.text('0');
      resolve();
      return;
    }

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

    // OPTIMIZATION #3: Map-based O(1) park lookup
    // Instead of filtering through all images for each park (O(n)), use a Map for instant lookup
    const parkImageMap = new Map();
    images.each(function (d) {
      parkImageMap.set(d.parkCode, {
        element: d3.select(this),
        data: d
      });
    });

    // OPTIMIZATION #4: Track last processed index to avoid O(n²) iteration
    // Instead of checking all parks 0->currentIndex every frame, only process new ones
    let lastProcessedIndex = 0;

    // OPTIMIZATION #1: Track all currently animating parks in a single array
    // Single unified RAF loop instead of 40+ concurrent loops (one per park)
    const animatingParks = [];

    function easeOutQuad(t) {
      return 1 - (1 - t) * (1 - t);
    }

    function easeInQuad(t) {
      return t * t;
    }

    // OPTIMIZATION #1: Single animation loop that updates ALL animating parks
    // Batches all park animations into one RAF loop instead of separate loops per park
    function updateAnimatingParks(currentTime) {
      // Update all parks that are currently animating
      for (let i = animatingParks.length - 1; i >= 0; i--) {
        const parkAnim = animatingParks[i];
        const localElapsed = currentTime - parkAnim.startTime;
        const localProgress = Math.min(localElapsed / individualDuration, 1);

        // Stamp effect (like pressing/stamping down a wooden piece)
        const eased = easeOutQuad(localProgress);
        const scale = 1.2 - (0.2 * eased); // Quick scale from 1.2 -> 1.0

        parkAnim.park.element.attr('transform',
          `translate(${parkAnim.cx}, ${parkAnim.cy}) scale(${scale}) translate(${-parkAnim.cx}, ${-parkAnim.cy})`);

        // Remove from array if animation is complete
        if (localProgress >= 1) {
          parkAnim.park.element.attr('transform', null);
          parkAnim.park.element.style('will-change', 'auto'); // OPTIMIZATION #5: Clean up hint
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

      // Update counter to match number of parks revealed
      counterElement.text(currentIndex);

      // OPTIMIZATION #4: Reveal only NEW parks since last frame
      // Only iterate over parks added since the last frame, not all from the beginning
      for (let i = lastProcessedIndex; i < currentIndex; i++) {
        const parkCode = chronologicalParks[i];

        // OPTIMIZATION #3: Get park from lookup map (O(1) instead of O(n) filter)
        const park = parkImageMap.get(parkCode);

        if (park) {
          const cx = park.data.x;
          const cy = park.data.y;

          // Apply drop shadow filter to make emblem look like solid wood
          park.element.attr('filter', 'url(#drop-shadow)');

          // OPTIMIZATION #5: Hint to browser that this element will animate (hardware acceleration)
          park.element.style('will-change', 'transform');

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
            park.element.attr('filter', 'url(#drop-shadow)');
            park.element.attr('transform', null);
          }
        }

        // Ensure counter shows exact final count
        counterElement.text(totalParks);

        // Trigger flourish animation
        counterElement.classed('complete', true);

        // Remove class after animation completes to allow re-triggering
        setTimeout(() => {
          counterElement.classed('complete', false);
        }, 700);

        // Animation complete - resolve the promise
        resolve();
      }
    }

    requestAnimationFrame(animateReveal);
  });
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

