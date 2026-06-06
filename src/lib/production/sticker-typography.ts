import type { CSSProperties } from "react";

/** Tahoma/Verdana print cleaner on thermal rolls than Arial at small sizes. */
export const STICKER_FONT = 'Tahoma, Verdana, Arial, Helvetica, sans-serif';

/** Slightly soft black — thermal prints lighter/thinner than pure #000. */
export const STICKER_PRINT_COLOR = "#2a2a2a";

export function stickerTextLine(style: CSSProperties): CSSProperties {
  return {
    margin: 0,
    padding: "0 0.4mm",
    fontFamily: STICKER_FONT,
    fontWeight: 300,
    fontSynthesis: "none",
    lineHeight: 1.5,
    color: STICKER_PRINT_COLOR,
    maxWidth: "100%",
    WebkitFontSmoothing: "none",
    MozOsxFontSmoothing: "auto",
    textRendering: "geometricPrecision",
    ...style,
  };
}
