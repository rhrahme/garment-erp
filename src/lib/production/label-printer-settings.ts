import {
  LABEL_ROLL_HEIGHT_MM,
  LABEL_ROLL_WIDTH_MM,
} from "@/lib/production/label-print-config";

/**
 * Clockwise rotation applied to the UPRIGHT portrait layout when generating the PDF.
 * The canonical design is a 50×100 mm portrait label: QR on top, text stacked below.
 *   - 0°   = portrait upright   (50×100 page)  ← DEFAULT, no rotation / no CTM tricks
 *   - 180° = portrait flipped   (50×100 page)  — same content, fed upside down
 *   - 90°  = landscape          (100×50 page)  — content rotated, feed-direction edge case
 *   - 270° = landscape flipped  (100×50 page)
 */
export type LabelRotationDeg = 0 | 90 | 180 | 270;

export const LABEL_ROTATION_STORAGE_KEY = "label-printer:rotation-deg";
export const LABEL_SCALE_STORAGE_KEY = "label-printer:scale-pct";

/** 50×100 mm portrait PDF — QR on top, horizontal text below, drawn upright. */
export const DEFAULT_LABEL_ROTATION: LabelRotationDeg = 0;

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
    value: 0,
    label: "0° — portrait upright (50×100)",
    description:
      "DEFAULT. PDF page = 50×100 mm portrait — QR on top, horizontal text below, drawn upright. Set the driver media to 50×100 mm (≈51×102) portrait, Scale 100% (NOT fit to paper), margins none. Use for the AIMO / Phomemo 50 mm head.",
  },
  {
    value: 180,
    label: "180° — portrait flipped (50×100)",
    description:
      "PDF page = 50×100 mm portrait, the upright layout rotated 180°. Driver media stays 50×100 mm portrait. Use when 0° is correct but the label feeds in upside down.",
  },
  {
    value: 90,
    label: "90° — landscape (100×50)",
    description:
      "EDGE CASE. PDF page = 100×50 mm landscape, the portrait layout rotated 90°. Set the driver media to 100×50 mm landscape. Only use if your printer truly feeds the long 100 mm edge across the head.",
  },
  {
    value: 270,
    label: "270° — landscape flipped (100×50)",
    description:
      "PDF page = 100×50 mm landscape, rotated the opposite way from 90°. Driver media stays 100×50 mm landscape. Try when 90° reads upside down.",
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
  // 0°/180° keep the portrait design upright (50×100). 90°/270° rotate it onto a
  // landscape page (100×50) for the long-edge feed edge case.
  if (rotation === 90 || rotation === 270) {
    return { width: LABEL_ROLL_HEIGHT_MM, height: LABEL_ROLL_WIDTH_MM };
  }
  return { width: LABEL_ROLL_WIDTH_MM, height: LABEL_ROLL_HEIGHT_MM };
}

export function labelPdfOrientation(rotation: LabelRotationDeg): "portrait" | "landscape" {
  return rotation === 90 || rotation === 270 ? "landscape" : "portrait";
}
