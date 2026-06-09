/**
 * Thermal roll label size for piece / fabric-cut stickers (AIMO + LabelLife).
 * Factory roll: 102 mm wide × 51 mm tall (landscape on the roll).
 */
export const LABEL_ROLL_WIDTH_MM = 102;
export const LABEL_ROLL_HEIGHT_MM = 51;

/**
 * LabelLife / AIMO driver media is 51×102 mm portrait (matches PDF MediaBox).
 * Landscape 102×51 PDFs are auto-rotated 90° CCW by the driver. Layout is authored
 * in 102×51 roll coordinates and mapped per element onto the portrait page — page-level
 * CTM wrappers are ignored by thermal drivers and clip content off-page.
 */
export const LABEL_PDF_FORMAT_MM = [LABEL_ROLL_WIDTH_MM, LABEL_ROLL_HEIGHT_MM] as const;
export const LABEL_PDF_ORIENTATION = "portrait" as const;
export const LABEL_PDF_PAGE_WIDTH_MM = LABEL_ROLL_HEIGHT_MM;
export const LABEL_PDF_PAGE_HEIGHT_MM = LABEL_ROLL_WIDTH_MM;

/** QR square on the left — ~47 mm fills 102×51 mm with 1 mm margins. */
export const LABEL_STICKER_QR_SIZE_MM = 47;

export const LABEL_STICKER_PADDING_H_MM = 1;
export const LABEL_STICKER_PADDING_V_MM = 1;
export const LABEL_STICKER_COLUMN_GAP_MM = 2;
export const LABEL_STICKER_BATCH_GAP_MM = 6;
export const LABEL_STICKER_LINE_GAP_MM = 0.35;

/** Thermal-readable font sizes (mm cap height) for 102×51 mm roll labels. */
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

/** Driver / LabelLife media setting (portrait page — matches PDF MediaBox). */
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
