// ============================================================================
// Configuration
// ============================================================================

const MAP_CONFIG = {
  width: 900,
  height: 500,
  simulationIterations: 2,
  parkRadius: {
    default: 14,
    overseas: 10
  },
  shadow: {
    blur: 2,
    offsetX: 0,
    offsetY: 2,
    opacity: 0.3
  },
  fade: {
    opacity: 0.4,
    hueRotation: 60,
    saturation: 0.6,
    brightness: 1.1
  }
};

// Featured parks that should be highlighted (not faded)
const featuredParks = ["bibe", "kica", "sequ", "yose", "jotr", "havo", "hale",
  "deva", "mora", "glac", "zion", "brca", "care", "sagu"];

// Overseas parks (Alaska, Hawaii, Virgin Islands) - smaller radius
const osParks = ["dena", "gaar", "glba", "katm", "npsa", "hale", "havo",
  "kefj", "lacl", "wrst", "kova", "viis"];

// ============================================================================
// SVG Filter Creation
// ============================================================================

/**
 * Creates a drop shadow filter for featured park images
 */
function createDropShadowFilter(defs, config) {
  const filter = defs.append('filter')
    .attr('id', 'drop-shadow')
    .attr('height', '130%');

  // Blur the source alpha (creates shadow shape)
  filter.append('feGaussianBlur')
    .attr('in', 'SourceAlpha')
    .attr('stdDeviation', config.shadow.blur);

  // Offset shadow position
  filter.append('feOffset')
    .attr('dx', config.shadow.offsetX)
    .attr('dy', config.shadow.offsetY)
    .attr('result', 'offsetblur');

  // Set shadow opacity
  filter.append('feComponentTransfer')
    .append('feFuncA')
    .attr('type', 'linear')
    .attr('slope', config.shadow.opacity);

  // Merge shadow with original graphic
  const merge = filter.append('feMerge');
  merge.append('feMergeNode'); // Shadow layer
  merge.append('feMergeNode').attr('in', 'SourceGraphic'); // Original image
}

/**
 * Creates a fade filter with color effects for non-featured park images
 * Applies: drop shadow + sepia + hue rotation + saturation + brightness
 */
function createFadeFilter(defs, config) {
  const filter = defs.append('filter')
    .attr('id', 'fade-shadow')
    .attr('height', '130%');

  // Drop shadow (same as featured parks)
  filter.append('feGaussianBlur')
    .attr('in', 'SourceAlpha')
    .attr('stdDeviation', config.shadow.blur)
    .attr('result', 'blur');

  filter.append('feOffset')
    .attr('in', 'blur')
    .attr('dx', config.shadow.offsetX)
    .attr('dy', config.shadow.offsetY)
    .attr('result', 'offsetBlur');

  filter.append('feComponentTransfer')
    .attr('in', 'offsetBlur')
    .append('feFuncA')
    .attr('type', 'linear')
    .attr('slope', config.shadow.opacity);

  // Color effects: Apply sepia tone (nature theme)
  filter.append('feColorMatrix')
    .attr('in', 'SourceGraphic')
    .attr('type', 'matrix')
    .attr('values', '0.393 0.769 0.189 0 0  0.349 0.686 0.168 0 0  0.272 0.534 0.131 0 0  0 0 0 1 0')
    .attr('result', 'sepia');

  // Rotate hue to green
  filter.append('feColorMatrix')
    .attr('in', 'sepia')
    .attr('type', 'hueRotate')
    .attr('values', config.fade.hueRotation)
    .attr('result', 'hue');

  // Reduce saturation
  filter.append('feColorMatrix')
    .attr('in', 'hue')
    .attr('type', 'saturate')
    .attr('values', config.fade.saturation)
    .attr('result', 'saturate');

  // Increase brightness
  const brightness = filter.append('feComponentTransfer')
    .attr('in', 'saturate')
    .attr('result', 'brightness');

  brightness.append('feFuncR')
    .attr('type', 'linear')
    .attr('slope', config.fade.brightness);

  brightness.append('feFuncG')
    .attr('type', 'linear')
    .attr('slope', config.fade.brightness);

  brightness.append('feFuncB')
    .attr('type', 'linear')
    .attr('slope', config.fade.brightness);

  // Combine shadow with color-adjusted image
  const merge = filter.append('feMerge');
  merge.append('feMergeNode').attr('in', 'offsetBlur');
  merge.append('feMergeNode').attr('in', 'brightness');
}

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
      ? config.parkRadius.overseas
      : config.parkRadius.default;

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
 * Determines if a park is featured
 */
function isFeatured(parkCode) {
  return featuredParks.includes(parkCode);
}

/**
 * Renders park images on the map
 */
function renderParkImages(map, nodes, config) {
  return map.selectAll('image.place')
    .data(nodes)
    .enter()
    .append('image')
    .attr('width', d => d.r * 2)
    .attr('height', d => d.r * 2)
    .attr('x', d => d.x - d.r)
    .attr('y', d => d.y - d.r)
    .attr('href', d => `img/np/${d.parkCode}.png`)
    .attr('preserveAspectRatio', 'xMidYMid slice')
    .attr('filter', d => isFeatured(d.parkCode) ? 'url(#drop-shadow)' : 'url(#fade-shadow)')
    .attr('opacity', d => isFeatured(d.parkCode) ? 1 : config.fade.opacity)
    .on('error', function () {
      d3.select(this).attr('visibility', 'hidden');
    });
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
  d3.select('body').on('touchend.tooltip', function() {
    // Keep touchState.active true for a short period to block mouse events
    setTimeout(() => {
      if (touchState.active && tooltip.style('display') !== 'none') {
        touchState.active = false;
      }
    }, 500);
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
createFadeFilter(defs, MAP_CONFIG);

// Create map group
const map = svg.append('g').attr('class', 'map');

// Load data and render
Promise.all([
  d3.json("https://unpkg.com/us-atlas@3.0.0/states-10m.json"),
  d3.json("./data/parks.json")
]).then(([usa, places]) => {
  // Draw map layers
  drawBaseMap(map, usa, path);
  drawStateBorders(map, usa, path);

  // Process park data
  const nodes = createParkNodes(places, projection, MAP_CONFIG);
  runForceSimulation(nodes, MAP_CONFIG);

  // Render park images
  const images = renderParkImages(map, nodes, MAP_CONFIG);

  // Setup tooltip
  const { tooltip, tipImg, tipName } = createTooltip();
  const touchState = { active: false, currentTarget: null };

  setupMouseInteractions(images, tooltip, tipImg, tipName, touchState);
  setupTouchInteractions(images, tooltip, tipImg, tipName, touchState);
});

// ============================================================================
// Visits Table
// ============================================================================

// Constants
const NO_VISITS_MESSAGE = '<p style="color: #666;">No visits recorded yet.</p>';
const PLACEHOLDER_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect fill="%23eee" width="80" height="80"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999" font-size="12"%3ENo Image%3C/text%3E%3C/svg%3E';

/**
 * Formats a date string to a readable format
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
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

    // Add year heading
    yearGroup.append('h3')
      .attr('class', 'visits-year-heading')
      .text(year);

    // Create grid for this year
    const grid = yearGroup.append('div')
      .attr('class', 'visits-grid');

    // Add year image card as first item in grid
    const yearImageCard = grid.append('div')
      .attr('class', 'year-image-card');

    yearImageCard.append('img')
      .attr('class', 'year-image-card__image')
      .attr('src', `./img/years/${year}.svg`)
      .attr('alt', `${year} highlight`)
      .on('error', function() {
        // Try PNG if SVG doesn't exist
        const img = d3.select(this);
        if (img.attr('src').endsWith('.svg')) {
          img.attr('src', `./img/years/${year}.png`);
        } else {
          // Hide the card if neither format exists
          d3.select(this.parentNode).style('display', 'none');
        }
      });

    // Create cards for all visits
    const cards = grid.selectAll('.visit-card')
      .data(visitsByYear[year])
      .enter()
      .append('div')
      .attr('class', 'visit-card');

    // Add image
    cards.append('img')
      .attr('class', 'visit-card__image')
      .attr('src', d => d.cancellationImage)
      .attr('alt', d => parksLookup[d.parkCode] || d.parkCode)
      .on('error', function() {
        d3.select(this).attr('src', PLACEHOLDER_IMAGE);
      });

    // Add content container
    const content = cards.append('div')
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

      renderVisitsTable(visits, parksLookup);
    })
    .catch(error => {
      console.log('Error loading data:', error);
      d3.select('#visits-table').html(NO_VISITS_MESSAGE);
    });
}

// Load visits table
loadVisitsTable();

