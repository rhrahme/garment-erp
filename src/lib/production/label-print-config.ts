/**
 * Thermal roll label size for piece / fabric-cut stickers (AIMO + LabelLife).
 * Factory roll: 10 cm wide × 5 cm tall (landscape on the roll).
 */
export const LABEL_ROLL_WIDTH_MM = 100;
export const LABEL_ROLL_HEIGHT_MM = 50;

/** QR square on the sticker face. */
export const LABEL_STICKER_QR_SIZE_MM = 12;

export const LABEL_STICKER_PADDING_H_MM = 2.5;
export const LABEL_STICKER_PADDING_V_MM = 1;
export const LABEL_STICKER_BATCH_GAP_MM = 6;
export const LABEL_STICKER_LINE_GAP_MM = 0.55;

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

export function labelRollWidthMm(): number {
  return LABEL_ROLL_WIDTH_MM;
}

export function labelRollHeightMm(): number {
  return LABEL_ROLL_HEIGHT_MM;
}

export function labelStickerPaddingCss(): string {
  return `${LABEL_STICKER_PADDING_V_MM}mm ${LABEL_STICKER_PADDING_H_MM}mm`;
}
