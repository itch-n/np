// ============================================================================
// Configuration
// ============================================================================

const MAP_CONFIG = {
  width: 900,
  height: 500,
  simulationIterations: 4,
  parkRadius: {
    default: 16,
    overseas: 12
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
  tipName.text(parkData.name);
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
    touchState.active = true;

    // Toggle tooltip if tapping same element
    if (touchState.currentTarget === event.currentTarget) {
      hideTooltip(tooltip);
      touchState.currentTarget = null;
      touchState.active = false;
      return;
    }

    // Show tooltip for new element
    touchState.currentTarget = event.currentTarget;
    showTooltip(tooltip, tipImg, tipName, d);

    const touch = event.touches[0];
    tooltip.style('display', 'block'); // Show first to get dimensions
    positionTooltip(tooltip, touch.clientX, touch.clientY, 10);
  });

  // Hide tooltip when tapping outside
  d3.select('body').on('touchstart', function (event) {
    if (!event.target.closest('image.place')) {
      hideTooltip(tooltip);
      touchState.currentTarget = null;
      touchState.active = false;
    }
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
