import type { MeasurementUnit } from "@/lib/types/pattern-library";

const UNICODE_FRACTIONS: Record<string, string> = {
  "1/2": "½",
  "1/4": "¼",
  "3/4": "¾",
  "1/8": "⅛",
  "3/8": "⅜",
  "5/8": "⅝",
  "7/8": "⅞",
  "1/16": "1/16",
  "3/16": "3/16",
  "5/16": "5/16",
  "7/16": "7/16",
  "9/16": "9/16",
  "11/16": "11/16",
  "13/16": "13/16",
  "15/16": "15/16",
};

/**
 * Formats a measurement for display. Inches render as mixed fractions the way
 * the pattern team writes them (5.625 -> "5⅝"); cm keep decimals.
 */
export function formatMeasurement(value: number | null | undefined, unit: MeasurementUnit): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (unit === "cm") {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  }
  const negative = value < 0;
  const abs = Math.abs(value);
  const whole = Math.floor(abs);
  const frac = abs - whole;
  // Snap to 16ths — pattern measurements are recorded to 1/16".
  const sixteenths = Math.round(frac * 16);
  if (sixteenths === 0) return `${negative ? "-" : ""}${whole}`;
  if (sixteenths === 16) return `${negative ? "-" : ""}${whole + 1}`;
  let num = sixteenths;
  let den = 16;
  while (num % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  const key = `${num}/${den}`;
  const glyph = UNICODE_FRACTIONS[key] ?? key;
  const fracText = glyph.includes("/") ? (whole > 0 ? ` ${glyph}` : glyph) : glyph;
  return `${negative ? "-" : ""}${whole > 0 ? whole : ""}${fracText}` || "0";
}

/**
 * ASCII variant for jsPDF (Helvetica/WinAnsi lacks ⅛ ⅜ ⅝ ⅞): 5.625 -> "5 5/8".
 */
export function formatMeasurementAscii(
  value: number | null | undefined,
  unit: MeasurementUnit
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  if (unit === "cm") return formatMeasurement(value, unit);
  const negative = value < 0;
  const abs = Math.abs(value);
  const whole = Math.floor(abs);
  const sixteenths = Math.round((abs - whole) * 16);
  if (sixteenths === 0) return `${negative ? "-" : ""}${whole}`;
  if (sixteenths === 16) return `${negative ? "-" : ""}${whole + 1}`;
  let num = sixteenths;
  let den = 16;
  while (num % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  return `${negative ? "-" : ""}${whole > 0 ? `${whole} ` : ""}${num}/${den}`;
}

/** Parses user input: decimals ("5.625"), fractions ("5 5/8", "5/8"), or unicode glyphs ("5⅝"). */
export function parseMeasurement(input: string): number | null {
  let text = input.trim();
  if (!text) return null;
  for (const [ascii, glyph] of Object.entries(UNICODE_FRACTIONS)) {
    if (glyph.length === 1) text = text.replace(glyph, ` ${ascii}`);
  }
  text = text.trim();
  const mixed = text.match(/^(-?\d+)?\s*(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const whole = mixed[1] ? parseInt(mixed[1], 10) : 0;
    const num = parseInt(mixed[2]!, 10);
    const den = parseInt(mixed[3]!, 10);
    if (!den) return null;
    const sign = whole < 0 || text.startsWith("-") ? -1 : 1;
    return sign * (Math.abs(whole) + num / den);
  }
  const decimal = Number(text.replace(",", "."));
  return Number.isFinite(decimal) ? decimal : null;
}

export function unitLabel(unit: MeasurementUnit): string {
  return unit === "cm" ? "cm" : "inches";
}
