import {
  LABEL_MATCH_PRINTER_PAGE_H_MM,
  LABEL_MATCH_PRINTER_PAGE_W_MM,
  LABEL_ROLL_HEIGHT_MM,
  LABEL_ROLL_WIDTH_MM,
} from "@/lib/production/label-print-config";

/**
 * Geometric (driver-honest) layouts. Each draws text horizontally for its own
 * page orientation; nothing is turned sideways. These require the driver media /
 * scale to match the PDF page. Kept as ALTERNATES for other printers.
 *   - 90°  = LANDSCAPE 100×50. QR LEFT, text RIGHT.
 *   - 270° = landscape 100×50, flipped 180°.
 *   - 0°   = portrait 50×100. QR top, text stacked below.
 *   - 180° = portrait 50×100, flipped 180°.
 */
export type LabelRotationDeg = 0 | 90 | 180 | 270;

/**
 * Full set of print modes. `"printer-match"` is the DEFAULT: it ADAPTS the PDF
 * to the user's D550 (driver media 51×102 portrait, "Fit to paper") instead of
 * asking them to change driver settings. The page is built at EXACTLY 51×102 mm
 * with portrait layout (QR top, text below) and identity transforms only — AIMO
 * drivers ignore PDF rotation matrices, so content must not use Tm rotation.
 * The driver's fixed ~90° CCW rasterisation maps that layout onto the physical
 * landscape label (QR left, horizontal text right).
 */
export const PRINTER_MATCH_MODE = "printer-match" as const;
export type LabelPrintMode = LabelRotationDeg | typeof PRINTER_MATCH_MODE;

// v3: introduced "printer-match" (adapt PDF to the D550 as-is) as the default.
// Bumping the key ignores any stored geometric value so the new default takes
// effect for everyone who printed with the older modes.
export const LABEL_ROTATION_STORAGE_KEY = "label-printer:mode:v3";
export const LABEL_SCALE_STORAGE_KEY = "label-printer:scale-pct";

/** Adapt the PDF to the D550's current settings (51×102 portrait, Fit to paper). */
export const DEFAULT_LABEL_ROTATION: LabelPrintMode = PRINTER_MATCH_MODE;

/** Content scale multiplier for thermal drivers that shrink PDFs to fit. */
export type LabelScalePct = 100 | 125 | 150;

export const DEFAULT_LABEL_SCALE_PCT: LabelScalePct = 100;

export const LABEL_SCALE_OPTIONS: ReadonlyArray<{
  value: LabelScalePct;
  label: string;
  description: string;
}> = [
  {
    value: 100,
    label: "Small (100%)",
    description: "Base layout size. Use when the driver prints at true 100% scale.",
  },
  {
    value: 125,
    label: "Medium (125%)",
    description: "Recommended when text and QR print smaller than expected with empty margins.",
  },
  {
    value: 150,
    label: "Large (150%)",
    description: "Maximum size for drivers that shrink content to fit the media box.",
  },
] as const;

const VALID_SCALE_PCT = new Set<LabelScalePct>([100, 125, 150]);

export function isLabelScalePct(value: number): value is LabelScalePct {
  return VALID_SCALE_PCT.has(value as LabelScalePct);
}

export function parseLabelScalePct(raw: string | number | null | undefined): LabelScalePct {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : raw;
  if (typeof n === "number" && isLabelScalePct(n)) return n;
  return DEFAULT_LABEL_SCALE_PCT;
}

export function labelScaleMultiplier(scalePct: LabelScalePct): number {
  return scalePct / 100;
}

export function readLabelScalePct(): LabelScalePct {
  if (typeof window === "undefined") return DEFAULT_LABEL_SCALE_PCT;
  return parseLabelScalePct(window.localStorage.getItem(LABEL_SCALE_STORAGE_KEY));
}

export function writeLabelScalePct(scalePct: LabelScalePct): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LABEL_SCALE_STORAGE_KEY, String(scalePct));
}

export const LABEL_ROTATION_OPTIONS: ReadonlyArray<{
  value: LabelPrintMode;
  label: string;
  description: string;
}> = [
  {
    value: PRINTER_MATCH_MODE,
    label: "Match my printer (51×102, Fit to paper) — DEFAULT",
    description:
      "DEFAULT. Adapts the PDF to your D550 as-is — DO NOT change any driver settings. Keep the driver media on 51×102 mm portrait, Scale “Fit to paper”, margins none, and just print. The PDF page is exactly 51×102 mm with QR on top and text below (no PDF rotation matrices — the driver ignores them). The printer’s built-in ~90° CCW turn maps that onto the landscape label: QR on the LEFT, text on the RIGHT.",
  },
  {
    value: 90,
    label: "Landscape 100×50 — QR left, text right (alternate)",
    description:
      "ALTERNATE for other printers. PDF page = 100×50 mm landscape, drawn natively: QR on the LEFT, horizontal text on the RIGHT. Requires the driver media / paper size set to 100×50 mm, Scale 100% — NEVER “Fit to paper” — margins none.",
  },
  {
    value: 270,
    label: "Landscape 100×50 — flipped (upside-down feed)",
    description:
      "Same native landscape layout as the default, flipped 180°. Driver media stays 100×50 mm landscape, Scale 100%, margins none. Use only if the default landscape comes out upside down.",
  },
  {
    value: 0,
    label: "Portrait 50×100 — QR top, text below — try this if blank",
    description:
      "Try this if browser printing comes out blank. PDF page = 50×100 mm portrait, drawn upright: QR on top, horizontal text stacked below. Set the driver media to 50×100 mm (≈51×102) portrait, Scale 100% (NOT “Fit to paper”), margins none. Or download the PDF and print from Preview.app.",
  },
  {
    value: 180,
    label: "Portrait 50×100 — flipped (upside-down feed)",
    description:
      "Portrait 50×100 layout flipped 180°. Driver media stays 50×100 mm portrait, Scale 100%, margins none. Use only if the portrait mode comes out upside down.",
  },
] as const;

const VALID_ROTATIONS = new Set<LabelRotationDeg>([0, 90, 180, 270]);

export function isLabelRotationDeg(value: number): value is LabelRotationDeg {
  return VALID_ROTATIONS.has(value as LabelRotationDeg);
}

export function isLabelPrintMode(value: string | number): value is LabelPrintMode {
  if (value === PRINTER_MATCH_MODE) return true;
  return typeof value === "number" && isLabelRotationDeg(value);
}

/** True for the "Match my printer" mode (pre-rotated 51×102 portrait page). */
export function isPrinterMatchMode(mode: LabelPrintMode): boolean {
  return mode === PRINTER_MATCH_MODE;
}

export function parseLabelRotation(raw: string | number | null | undefined): LabelPrintMode {
  if (raw === PRINTER_MATCH_MODE) return PRINTER_MATCH_MODE;
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : raw;
  if (typeof n === "number" && isLabelRotationDeg(n)) return n;
  return DEFAULT_LABEL_ROTATION;
}

export function readLabelRotation(): LabelPrintMode {
  if (typeof window === "undefined") return DEFAULT_LABEL_ROTATION;
  return parseLabelRotation(window.localStorage.getItem(LABEL_ROTATION_STORAGE_KEY));
}

export function writeLabelRotation(rotation: LabelPrintMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LABEL_ROTATION_STORAGE_KEY, String(rotation));
}

export function labelPdfPageSizeMm(mode: LabelPrintMode): { width: number; height: number } {
  // printer-match = portrait 51×102 (EXACT driver media; Fit-to-paper is a no-op).
  if (mode === PRINTER_MATCH_MODE) {
    return { width: LABEL_MATCH_PRINTER_PAGE_W_MM, height: LABEL_MATCH_PRINTER_PAGE_H_MM };
  }
  // 90°/270° = native landscape page (100×50, QR left / text right).
  // 0°/180° = native portrait page (50×100, QR top / text below).
  if (mode === 90 || mode === 270) {
    return { width: LABEL_ROLL_HEIGHT_MM, height: LABEL_ROLL_WIDTH_MM };
  }
  return { width: LABEL_ROLL_WIDTH_MM, height: LABEL_ROLL_HEIGHT_MM };
}

export function labelPdfOrientation(mode: LabelPrintMode): "portrait" | "landscape" {
  // printer-match is a portrait page (the readable content is pre-rotated within it).
  return mode === 90 || mode === 270 ? "landscape" : "portrait";
}
