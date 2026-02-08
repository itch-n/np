// Map dimensions
const width = 900;
const height = 500;

// Featured parks that should be highlighted (not faded)
const featuredParks = ["bibe", "kica", "sequ", "yose", "jotr", "havo", "hale",
  "deva", "mora", "glac", "zion", "brca", "care", "sagu"];

// Initialize projection
const projection = geoAlbersUsaTerritories.geoAlbersUsaTerritories()
  .scale(width)
  .translate([width / 2, height / 2.2]);

const path = d3.geoPath()
  .projection(projection);

// Create SVG
const svg = d3.select("#content")
  .append("svg")
  .attr('id', 'map')
  .attr('viewBox', `0 0 ${width} ${height}`)
  .attr('preserveAspectRatio', 'xMidYMid meet');

const map = svg.append('g')
  .attr('class', 'map');

// Load data and render map
Promise.all([
  d3.json("https://unpkg.com/us-atlas@3.0.0/states-10m.json"),
  d3.json("./data/parks.json")
]).then(([usa, places]) => {

  // Draw US map
  map.selectAll('path')
    .data(topojson.feature(usa, usa.objects.nation).features)
    .enter().append("path")
    .attr("d", path)
    .attr("class", "outline");

  // Draw state borders
  map.append("path")
    .datum(topojson.mesh(usa, usa.objects.states, (a, b) => a !== b))
    .attr("class", "mesh")
    .attr("d", path);

  // Convert lat/lon to projected coordinates and set initial positions
  const nodes = places.map(d => {
    const coords = projection([+d.longitude, +d.latitude]);
    if (!coords) return null;
    return {
      ...d,
      r: 25,
      px: coords[0],
      py: coords[1],
      x: coords[0],
      y: coords[1]
    };
  }).filter(Boolean);

  // D3 force simulation: pull nodes toward their projected positions and prevent overlaps
  const sim = d3.forceSimulation(nodes)
    .force('x', d3.forceX(d => d.px))
    .force('y', d3.forceY(d => d.py))
    .force('collide', d3.forceCollide().radius(d => d.r + 2))
    .stop();

  for (let i = 0; i < 5; i++) {
    sim.tick();
  }

  // Add park images
  const images = map.selectAll('image.place')
    .data(nodes)
    .enter()
    .append('image')
    .attr('class', d => !featuredParks.includes(d.parkCode) ? 'fade' : null)
    .attr('width', d => d.r * 2)
    .attr('height', d => d.r * 2)
    .attr('x', d => d.x - d.r)
    .attr('y', d => d.y - d.r)
    .attr('href', d => `img/np/${d.parkCode}.png`)
    .attr('preserveAspectRatio', 'xMidYMid slice')
    .on('error', function () {
      d3.select(this).attr('visibility', 'hidden');
    });

  // Create tooltip
  const tooltip = d3.select('body').append('div').attr('class', 'tooltip');
  const tipImg = tooltip.append('img').attr('alt', 'preview');

  // Add hover handlers
  images
    .on('mouseover', (event, d) => {
      tipImg.attr('src', `img/np/${d.parkCode}.png`);
      tooltip.style('display', 'block');
    })
    .on('mousemove', (event) => {
      const pad = 0;
      const tipNode = tooltip.node();
      const tipW = tipNode.offsetWidth;
      const tipH = tipNode.offsetHeight;

      let x = event.clientX + pad;
      let y = event.clientY + pad;

      // Determine whether we need to flip horizontally/vertically
      const flipX = (x + tipW > window.innerWidth - pad);
      const flipY = (y + tipH > window.innerHeight - pad);

      // Set CSS variables for positioning
      tooltip.style('--tx', `${x}px`).style('--ty', `${y}px`);
      tooltip.classed('flip-x', flipX).classed('flip-y', flipY).style('display', 'block');
    })
    .on('mouseout', () => tooltip.style('display', 'none'));
});
