/**
 * Shared fabric-board transform for nest preview / PDF / print sheet.
 * Always uses uniform scale so DXF outlines keep real proportions.
 */

export type NestMapTransform = {
  /** mm (or px) per cm - same for X and Y */
  scale: number;
  /** Offset inside the map rect so the fabric strip is centered (letterbox). */
  offsetX: number;
  offsetY: number;
  /** Drawn fabric strip size inside the map (may be smaller than map when letterboxed). */
  contentW: number;
  contentH: number;
};

/**
 * Fit lengthCm x usableWidthCm into mapW x mapH with uniform scale (letterbox).
 * Prevents the PDF height-cap from squashing DXF polylines relative to the interactive board.
 */
export function nestMapTransform(
  lengthCm: number,
  usableWidthCm: number,
  mapW: number,
  mapH: number
): NestMapTransform {
  const L = Math.max(lengthCm, 1e-6);
  const W = Math.max(usableWidthCm, 1e-6);
  const scale = Math.min(mapW / L, mapH / W);
  const contentW = L * scale;
  const contentH = W * scale;
  return {
    scale,
    offsetX: (mapW - contentW) / 2,
    offsetY: (mapH - contentH) / 2,
    contentW,
    contentH,
  };
}

/** Suggested nest map height (same units as mapW) for A4 / SVG boards. */
export function nestMapHeight(
  mapW: number,
  lengthCm: number,
  usableWidthCm: number,
  options: { hasDxfOutlines?: boolean; maxH?: number; minH?: number } = {}
): number {
  const natural = (mapW * Math.max(usableWidthCm, 1)) / Math.max(lengthCm, 1);
  const minH = options.minH ?? 18;
  const maxH = options.maxH ?? (options.hasDxfOutlines ? 58 : 36);
  return Math.min(maxH, Math.max(minH, natural));
}
