// ============================================================================
// SVG Filter Creation
// ============================================================================

/**
 * Creates a drop shadow filter for featured park images with brown tint and directional lighting
 * @param {d3.Selection} defs - D3 selection of the SVG <defs> element
 * @param {Object} config - Configuration object (currently unused but kept for consistency)
 */
export function createDropShadowFilter(defs, config) {
  const filter = defs.append('filter')
    .attr('id', 'drop-shadow')
    .attr('height', '150%')
    .attr('width', '150%');

  // === OUTER SHADOW (Soft, ambient) ===

  // Blur the source alpha for outer shadow
  filter.append('feGaussianBlur')
    .attr('in', 'SourceAlpha')
    .attr('stdDeviation', '4')
    .attr('result', 'outerBlur');

  // Offset shadow directionally (light from top-left)
  filter.append('feOffset')
    .attr('in', 'outerBlur')
    .attr('dx', '1')
    .attr('dy', '5')
    .attr('result', 'outerOffset');

  // Add brown tint to outer shadow
  filter.append('feColorMatrix')
    .attr('in', 'outerOffset')
    .attr('type', 'matrix')
    .attr('values', '0.83 0 0 0 0  0 0.77 0 0 0  0 0 0.69 0 0  0 0 0 0.25 0')
    .attr('result', 'outerShadow');

  // === INNER SHADOW (Sharp, defined) ===

  // Blur the source alpha for inner shadow
  filter.append('feGaussianBlur')
    .attr('in', 'SourceAlpha')
    .attr('stdDeviation', '2')
    .attr('result', 'innerBlur');

  // Offset shadow directionally (same direction, less distance)
  filter.append('feOffset')
    .attr('in', 'innerBlur')
    .attr('dx', '1')
    .attr('dy', '3')
    .attr('result', 'innerOffset');

  // Add brown tint to inner shadow (darker)
  filter.append('feColorMatrix')
    .attr('in', 'innerOffset')
    .attr('type', 'matrix')
    .attr('values', '0.83 0 0 0 0  0 0.77 0 0 0  0 0 0.69 0 0  0 0 0 0.35 0')
    .attr('result', 'innerShadow');

  // === COMPOSITE EVERYTHING ===
  const merge = filter.append('feMerge');
  merge.append('feMergeNode').attr('in', 'outerShadow');    // Soft outer shadow
  merge.append('feMergeNode').attr('in', 'innerShadow');    // Sharp inner shadow
  merge.append('feMergeNode').attr('in', 'SourceGraphic');  // Original image
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