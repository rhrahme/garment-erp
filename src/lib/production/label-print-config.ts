/**
 * Thermal roll label size for piece / fabric-cut stickers (AIMO + LabelLife).
 * Change here if your roll media differs (e.g. 4×6 shipping labels).
 */
export const LABEL_ROLL_WIDTH_IN = 3;
export const LABEL_ROLL_HEIGHT_IN = 2;

export function labelRollSizeCss(): string {
  return `${LABEL_ROLL_WIDTH_IN}in ${LABEL_ROLL_HEIGHT_IN}in`;
}

export function labelRollWidthCss(): string {
  return `${LABEL_ROLL_WIDTH_IN}in`;
}

export function labelRollHeightCss(): string {
  return `${LABEL_ROLL_HEIGHT_IN}in`;
}

export function labelRollSizeLabel(): string {
  return `${LABEL_ROLL_WIDTH_IN}×${LABEL_ROLL_HEIGHT_IN} in`;
}

export function labelRollWidthMm(): number {
  return LABEL_ROLL_WIDTH_IN * 25.4;
}

export function labelRollHeightMm(): number {
  return LABEL_ROLL_HEIGHT_IN * 25.4;
}
