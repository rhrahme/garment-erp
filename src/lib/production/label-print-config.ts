/**
 * Thermal roll label size for piece / fabric-cut stickers (AIMO / Phomemo "D550").
 *
 * BREAKTHROUGH (geometry): the print head is 2 inch / 50 mm wide. The physical
 * label is 50 mm wide × 100 mm long, PORTRAIT — the 50 mm edge runs across the
 * head, the 100 mm runs along the feed. The driver media preset "51 × 102 mm
 * portrait" is therefore CORRECT. Content is drawn UPRIGHT on a portrait page:
 * QR on top, horizontal text stacked below (read top-to-bottom, no turning).
 */
export const LABEL_ROLL_WIDTH_MM = 50;
export const LABEL_ROLL_HEIGHT_MM = 100;

/**
 * D550 native print resolution (8 dots/mm). Rendering the raster at the printer's
 * EXACT device resolution means the browser/driver maps image pixels ~1:1 to printer
 * dots — no non-integer downscale (the old 300→203 resample shifted QR module
 * boundaries and fragmented the code). QR modules are also whole integer pixels here.
 */
export const STICKER_RASTER_DPI = 203;

/**
 * "Match my printer" media — the EXACT driver media of the user's D550 preset
 * (51 × 102 mm portrait). The PDF page is built at this size so the print
 * dialog's "Fit to paper" is a no-op (same aspect → no rescale, no rotation).
 * Content uses portrait layout (QR on top, text below) with identity transforms
 * only — AIMO drivers ignore PDF rotation matrices. The driver's fixed ~90° CCW
 * rasterisation maps portrait top → landscape left on the physical label.
 */
export const LABEL_MATCH_PRINTER_PAGE_W_MM = 51;
export const LABEL_MATCH_PRINTER_PAGE_H_MM = 102;

/**
 * PDF convention for LabelLife / AIMO roll printing:
 * - One physical label = one PDF page (never stack multiple labels on one page).
 * - MediaBox matches the roll exactly: 50×100 mm portrait (width × height).
 * - Print at 100% scale, margins none, do NOT "fit to paper".
 * Use the rotation setting only for feed-direction edge cases.
 */
export const LABEL_PDF_FORMAT_MM = [LABEL_ROLL_WIDTH_MM, LABEL_ROLL_HEIGHT_MM] as const;
export const LABEL_PDF_ORIENTATION = "portrait" as const;
export const LABEL_PDF_PAGE_WIDTH_MM = LABEL_ROLL_WIDTH_MM;
export const LABEL_PDF_PAGE_HEIGHT_MM = LABEL_ROLL_HEIGHT_MM;

/**
 * QR square on top. 27 mm (~30% smaller than the previous 38 mm) frees vertical space
 * for the text block while staying crisp and reliably scannable — at 203 DPI a short
 * payload still renders several whole device px per module.
 */
export const LABEL_STICKER_QR_SIZE_MM = 27;

export const LABEL_STICKER_PADDING_H_MM = 2;
export const LABEL_STICKER_PADDING_V_MM = 2;
/** Vertical gap between the QR block and the text block below it. */
export const LABEL_STICKER_COLUMN_GAP_MM = 2.5;
export const LABEL_STICKER_BATCH_GAP_MM = 4;
export const LABEL_STICKER_LINE_GAP_MM = 0.6;

/**
 * Thermal-readable font sizes (mm cap height) for the 50×100 mm portrait label.
 * Reduced ~17% overall (from the previous set) so the block is more compact and balanced
 * with the smaller QR, while keeping the emphasis hierarchy (cutLength stays the largest).
 */
export const LABEL_STICKER_FONT_MM = {
  header: 2.8,
  clientCode: 3.6,
  clientName: 3.3,
  productionCode: 3.3,
  fabric: 3.15,
  cutLength: 3.8,
  labels: 3.15,
  spec: 2.8,
  piece: 3.15,
} as const;

export function labelRollSizeCss(): string {
  return `${LABEL_ROLL_WIDTH_MM}mm ${LABEL_ROLL_HEIGHT_MM}mm`;
}

export function labelRollWidthCss(): string {
  return `${LABEL_ROLL_WIDTH_MM}mm`;
}

export function labelRollHeightCss(): string {
  return `${LABEL_ROLL_HEIGHT_MM}mm`;
}

export function labelRollSizeLabel(): string {
  return `${LABEL_ROLL_WIDTH_MM / 10}×${LABEL_ROLL_HEIGHT_MM / 10} cm`;
}

export function labelRollSizeMmLabel(): string {
  return `${LABEL_ROLL_WIDTH_MM} × ${LABEL_ROLL_HEIGHT_MM} mm`;
}

/** Driver / LabelLife media setting (matches PDF MediaBox). */
export function labelPdfMediaLabel(): string {
  return `${LABEL_PDF_PAGE_WIDTH_MM} × ${LABEL_PDF_PAGE_HEIGHT_MM} mm portrait`;
}

export function labelPdfMediaMmLabel(): string {
  return `${LABEL_PDF_PAGE_WIDTH_MM} × ${LABEL_PDF_PAGE_HEIGHT_MM} mm`;
}

export function labelRollWidthMm(): number {
  return LABEL_ROLL_WIDTH_MM;
}

export function labelRollHeightMm(): number {
  return LABEL_ROLL_HEIGHT_MM;
}

export function labelStickerPaddingCss(): string {
  return `${LABEL_STICKER_PADDING_V_MM}mm ${LABEL_STICKER_PADDING_H_MM}mm`;
}
