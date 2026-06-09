import {
  LABEL_ROLL_HEIGHT_MM,
  LABEL_ROLL_WIDTH_MM,
} from "@/lib/production/label-print-config";

/**
 * Selects which NATIVE label layout the PDF is drawn in. Each option draws text
 * horizontally (left-to-right) for its own page orientation — nothing is ever
 * turned sideways. The 180°/270° variants are 180° flips for upside-down feed.
 *   - 90°  = LANDSCAPE 100×50  ← DEFAULT. QR on the LEFT, text column on the RIGHT.
 *            For printers whose physical label is landscape (the 100 mm long edge
 *            feeds across the head). This is the AIMO / Phomemo "D550".
 *   - 270° = landscape 100×50, flipped 180° (use if 90° feeds in upside down).
 *   - 0°   = portrait 50×100. QR on top, text stacked below.
 *   - 180° = portrait 50×100, flipped 180°.
 */
export type LabelRotationDeg = 0 | 90 | 180 | 270;

// v2: switched default to native landscape (100×50). Bumping the key ignores any
// stored portrait value from earlier testing so the landscape default takes effect.
export const LABEL_ROTATION_STORAGE_KEY = "label-printer:rotation-deg:v2";
export const LABEL_SCALE_STORAGE_KEY = "label-printer:scale-pct";

/** Native landscape 100×50 PDF — QR on the left, horizontal text on the right. */
export const DEFAULT_LABEL_ROTATION: LabelRotationDeg = 90;

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
  value: LabelRotationDeg;
  label: string;
  description: string;
}> = [
  {
    value: 90,
    label: "Landscape 100×50 (default) — QR left, text right",
    description:
      "DEFAULT. PDF page = 100×50 mm landscape, drawn natively: QR on the LEFT, horizontal text on the RIGHT, reading left-to-right. For printers that feed the 100 mm LONG edge (the physical label is wider than it is tall). Set the driver media / paper size to 100×50 mm (custom if needed), Scale 100% — NEVER “Fit to paper” — margins none.",
  },
  {
    value: 270,
    label: "Landscape 100×50 — flipped (upside-down feed)",
    description:
      "Same native landscape layout as the default, flipped 180°. Driver media stays 100×50 mm landscape, Scale 100%, margins none. Use only if the default landscape comes out upside down.",
  },
  {
    value: 0,
    label: "Portrait 50×100 — QR top, text below",
    description:
      "PDF page = 50×100 mm portrait, drawn upright: QR on top, horizontal text stacked below. For printers whose physical label is TALLER than it is wide (the 50 mm short edge feeds across the head). Set the driver media to 50×100 mm (≈51×102) portrait, Scale 100% (NOT “Fit to paper”), margins none.",
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

export function parseLabelRotation(raw: string | number | null | undefined): LabelRotationDeg {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : raw;
  if (typeof n === "number" && isLabelRotationDeg(n)) return n;
  return DEFAULT_LABEL_ROTATION;
}

export function readLabelRotation(): LabelRotationDeg {
  if (typeof window === "undefined") return DEFAULT_LABEL_ROTATION;
  return parseLabelRotation(window.localStorage.getItem(LABEL_ROTATION_STORAGE_KEY));
}

export function writeLabelRotation(rotation: LabelRotationDeg): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LABEL_ROTATION_STORAGE_KEY, String(rotation));
}

export function labelPdfPageSizeMm(rotation: LabelRotationDeg): { width: number; height: number } {
  // 90°/270° = native landscape page (100×50, QR left / text right) — the DEFAULT.
  // 0°/180° = native portrait page (50×100, QR top / text below).
  if (rotation === 90 || rotation === 270) {
    return { width: LABEL_ROLL_HEIGHT_MM, height: LABEL_ROLL_WIDTH_MM };
  }
  return { width: LABEL_ROLL_WIDTH_MM, height: LABEL_ROLL_HEIGHT_MM };
}

export function labelPdfOrientation(rotation: LabelRotationDeg): "portrait" | "landscape" {
  return rotation === 90 || rotation === 270 ? "landscape" : "portrait";
}
