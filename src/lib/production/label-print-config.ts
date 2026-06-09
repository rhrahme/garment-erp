/**
 * Thermal roll label size for piece / fabric-cut stickers (AIMO + LabelLife).
 * Physical roll label: 100 mm wide × 50 mm tall = 10×5 cm (landscape on the roll).
 */
export const LABEL_ROLL_WIDTH_MM = 100;
export const LABEL_ROLL_HEIGHT_MM = 50;

/**
 * PDF convention for LabelLife / AIMO roll printing:
 * - One physical label = one PDF page (never stack multiple labels on one page).
 * - MediaBox matches the roll exactly: 100×50 mm landscape (width × height).
 * - Print at 100% scale, margins none, do not “fit to page”.
 * Override rotation in printer settings only if content prints sideways or inverted.
 */
export const LABEL_PDF_FORMAT_MM = [LABEL_ROLL_WIDTH_MM, LABEL_ROLL_HEIGHT_MM] as const;
export const LABEL_PDF_ORIENTATION = "landscape" as const;
export const LABEL_PDF_PAGE_WIDTH_MM = LABEL_ROLL_WIDTH_MM;
export const LABEL_PDF_PAGE_HEIGHT_MM = LABEL_ROLL_HEIGHT_MM;

/** QR square on the left — ~46 mm fills 100×50 mm with 1 mm margins. */
export const LABEL_STICKER_QR_SIZE_MM = 46;

export const LABEL_STICKER_PADDING_H_MM = 1;
export const LABEL_STICKER_PADDING_V_MM = 1;
export const LABEL_STICKER_COLUMN_GAP_MM = 2;
export const LABEL_STICKER_BATCH_GAP_MM = 6;
export const LABEL_STICKER_LINE_GAP_MM = 0.35;

/** Thermal-readable font sizes (mm cap height) for 100×50 mm roll labels. */
export const LABEL_STICKER_FONT_MM = {
  header: 3.5,
  clientCode: 4.5,
  clientName: 4.2,
  productionCode: 4.1,
  fabric: 4.0,
  cutLength: 4.8,
  labels: 4.0,
  spec: 3.8,
  piece: 4.0,
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
  return `${LABEL_PDF_PAGE_WIDTH_MM} × ${LABEL_PDF_PAGE_HEIGHT_MM} mm landscape`;
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
