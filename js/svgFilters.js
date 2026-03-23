// ============================================================================
// SVG Filter Creation
// ============================================================================

/**
 * Creates a solid shadow effect with brown wood color
 * Makes emblems look like solid chunks of wood with sharp shadows
 * @param {d3.Selection} defs - D3 selection of the SVG <defs> element
 * @param {Object} config - Configuration object (currently unused but kept for consistency)
 */
export function createDropShadowFilter(defs, config) {
  const filter = defs.append('filter')
    .attr('id', 'drop-shadow')
    .attr('height', '115%')
    .attr('width', '115%')
    .attr('x', '-7.5%')
    .attr('y', '-7.5%');

  // Offset the alpha to create shadow position
  filter.append('feOffset')
    .attr('in', 'SourceAlpha')
    .attr('dx', '0.5')
    .attr('dy', '1')
    .attr('result', 'offsetAlpha');

  // Flood with brown wood color (lighter, more subtle)
  filter.append('feFlood')
    .attr('flood-color', '#9B7760')
    .attr('result', 'brownColor');

  // Composite the color with the offset alpha shape
  filter.append('feComposite')
    .attr('in', 'brownColor')
    .attr('in2', 'offsetAlpha')
    .attr('operator', 'in')
    .attr('result', 'brownShadow');

  // Stack layers: shadow behind original
  const merge = filter.append('feMerge');
  merge.append('feMergeNode').attr('in', 'brownShadow');     // Brown shadow behind
  merge.append('feMergeNode').attr('in', 'SourceGraphic');   // Original image on top
}

/**
 * Creates an inset shadow filter with solid background
 * and realistic brown-tinted double shadow for non-featured park images
 * @param {d3.Selection} defs - D3 selection of the SVG <defs> element
 * @param {Object} config - Configuration object (currently unused but kept for consistency)
 */
export function createInsetShadowFilter(defs, config) {
  const filter = defs.append('filter')
    .attr('id', 'inset-shadow');

  // Create solid background (#FCFAF8)
  filter.append('feFlood')
    .attr('flood-color', '#FCFAF8')
    .attr('result', 'whiteBg');

  // Composite background with the image shape
  filter.append('feComposite')
    .attr('in', 'whiteBg')
    .attr('in2', 'SourceAlpha')
    .attr('operator', 'in')
    .attr('result', 'whiteShape');

  // === INNER SHADOW (Sharp, darker) ===

  // Invert alpha for inner shadow
  filter.append('feColorMatrix')
    .attr('in', 'SourceAlpha')
    .attr('type', 'matrix')
    .attr('values', '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1 1')
    .attr('result', 'innerInverse');

  // Blur for inner shadow (sharper)
  filter.append('feGaussianBlur')
    .attr('in', 'innerInverse')
    .attr('stdDeviation', '3')
    .attr('result', 'innerBlurred');

  // Offset directionally (light from top-left)
  filter.append('feOffset')
    .attr('in', 'innerBlurred')
    .attr('dx', '1')
    .attr('dy', '3')
    .attr('result', 'innerOffset');

  // Clip to shape
  filter.append('feComposite')
    .attr('in', 'innerOffset')
    .attr('in2', 'SourceAlpha')
    .attr('operator', 'in')
    .attr('result', 'innerClipped');

  // Add brown tint and darken
  filter.append('feColorMatrix')
    .attr('in', 'innerClipped')
    .attr('type', 'matrix')
    .attr('values', '0.83 0 0 0 0  0 0.77 0 0 0  0 0 0.69 0 0  0 0 0 0.4 0')
    .attr('result', 'innerShadow');

  // === OUTER SHADOW (Soft, subtle) ===

  // Invert alpha for outer shadow
  filter.append('feColorMatrix')
    .attr('in', 'SourceAlpha')
    .attr('type', 'matrix')
    .attr('values', '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1 1')
    .attr('result', 'outerInverse');

  // Blur for outer shadow (softer)
  filter.append('feGaussianBlur')
    .attr('in', 'outerInverse')
    .attr('stdDeviation', '7')
    .attr('result', 'outerBlurred');

  // Offset directionally (same direction, slightly more)
  filter.append('feOffset')
    .attr('in', 'outerBlurred')
    .attr('dx', '1')
    .attr('dy', '3')
    .attr('result', 'outerOffset');

  // Clip to shape
  filter.append('feComposite')
    .attr('in', 'outerOffset')
    .attr('in2', 'SourceAlpha')
    .attr('operator', 'in')
    .attr('result', 'outerClipped');

  // Add brown tint and lighten (subtle)
  filter.append('feColorMatrix')
    .attr('in', 'outerClipped')
    .attr('type', 'matrix')
    .attr('values', '0.83 0 0 0 0  0 0.77 0 0 0  0 0 0.69 0 0  0 0 0 0.2 0')
    .attr('result', 'outerShadow');

  // === COMPOSITE EVERYTHING ===
  const merge = filter.append('feMerge');
  merge.append('feMergeNode').attr('in', 'whiteShape');     // Background
  merge.append('feMergeNode').attr('in', 'outerShadow');    // Soft outer shadow
  merge.append('feMergeNode').attr('in', 'innerShadow');    // Sharp inner shadow
}
