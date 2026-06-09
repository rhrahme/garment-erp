import {
  LABEL_ROLL_HEIGHT_MM,
  LABEL_ROLL_WIDTH_MM,
} from "@/lib/production/label-print-config";

/** Clockwise rotation applied to roll layout when generating the PDF. */
export type LabelRotationDeg = 0 | 90 | 180 | 270;

export const LABEL_ROTATION_STORAGE_KEY = "label-printer:rotation-deg";
export const LABEL_SCALE_STORAGE_KEY = "label-printer:scale-pct";

/** Matches prior portrait per-element mapping (LabelLife 51×102 media). */
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
    value: 0,
    label: "0° — landscape",
    description:
      "102×51 mm PDF, no rotation. QR on the left, text horizontal. Use when the driver prints the label as-is.",
  },
  {
    value: 90,
    label: "90° — portrait (default)",
    description:
      "51×102 mm portrait PDF with content mapped for LabelLife/AIMO. QR on the left, text horizontal on the physical 102×51 label.",
  },
  {
    value: 180,
    label: "180° — upside down",
    description:
      "102×51 mm PDF rotated 180°. Try when the label feeds inverted or content appears upside down.",
  },
  {
    value: 270,
    label: "270° — portrait flipped",
    description:
      "51×102 mm portrait PDF with the opposite mapping from 90°. Try when content prints sideways along the long edge.",
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
  if (rotation === 90 || rotation === 270) {
    return { width: LABEL_ROLL_HEIGHT_MM, height: LABEL_ROLL_WIDTH_MM };
  }
  return { width: LABEL_ROLL_WIDTH_MM, height: LABEL_ROLL_HEIGHT_MM };
}

export function labelPdfOrientation(rotation: LabelRotationDeg): "portrait" | "landscape" {
  return rotation === 90 || rotation === 270 ? "portrait" : "landscape";
}
