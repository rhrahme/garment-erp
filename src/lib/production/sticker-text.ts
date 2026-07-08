import { parse, type OtFont } from "@/lib/production/vendor/opentype.js";
import { ROBOTO_REGULAR_BASE64 } from "@/lib/production/fonts/roboto-regular-base64";

/**
 * Server-side text → SVG vector paths.
 *
 * librsvg resolves <text> via fontconfig/system fonts. Production Linux images ship
 * no Helvetica/Arial, so every glyph rendered as a .notdef "tofu" box — that is why
 * printed/PDF labels had no readable text while local (macOS, fonts present) looked
 * fine. Converting text to <path> glyph outlines with an embedded font makes the SVG
 * fully self-contained and host-font-independent, so text renders identically
 * everywhere. All coordinates/sizes are in the SVG's mm user units.
 */

let cachedFont: OtFont | null = null;

function getFont(): OtFont {
  if (cachedFont) return cachedFont;
  const bytes = Buffer.from(ROBOTO_REGULAR_BASE64, "base64");
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  cachedFont = parse(ab);
  return cachedFont;
}

export type TextAnchor = "left" | "center" | "right";

export function measureStickerText(text: string, fontMm: number): number {
  if (!text) return 0;
  return getFont().getAdvanceWidth(text, fontMm);
}

/** Truncate with an ellipsis so the rendered width fits `maxWidthMm` (exact metrics). */
export function fitStickerText(text: string, maxWidthMm: number, fontMm: number): string {
  const font = getFont();
  if (font.getAdvanceWidth(text, fontMm) <= maxWidthMm) return text;
  let trimmed = text;
  while (trimmed.length > 1 && font.getAdvanceWidth(`${trimmed}…`, fontMm) > maxWidthMm) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

function capCenterOffsetMm(font: OtFont, fontMm: number): number {
  const cap = font.tables.os2?.sCapHeight
    ? font.tables.os2.sCapHeight / font.unitsPerEm
    : 0.7;
  return (cap * fontMm) / 2;
}

/**
 * One line of text as an SVG <path>, vertically centered on `y` (matches the old
 * dominant-baseline="middle" placement) and horizontally aligned to `x`.
 */
export function stickerTextPath(opts: {
  text: string;
  x: number;
  y: number;
  fontMm: number;
  anchor?: TextAnchor;
  fill?: string;
}): string {
  const { text, x, y, fontMm, anchor = "left", fill = "#000000" } = opts;
  if (!text) return "";
  const font = getFont();
  const width = font.getAdvanceWidth(text, fontMm);
  const drawX = anchor === "right" ? x - width : anchor === "center" ? x - width / 2 : x;
  const baselineY = y + capCenterOffsetMm(font, fontMm);
  const d = font.getPath(text, drawX, baselineY, fontMm).toPathData(2);
  return `<path d="${d}" fill="${fill}"/>`;
}
