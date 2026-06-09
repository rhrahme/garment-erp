import {
  LABEL_ROLL_HEIGHT_MM,
  LABEL_ROLL_WIDTH_MM,
} from "@/lib/production/label-print-config";

/** Clockwise rotation applied to roll layout when generating the PDF. */
export type LabelRotationDeg = 0 | 90 | 180 | 270;

export const LABEL_ROTATION_STORAGE_KEY = "label-printer:rotation-deg";
export const LABEL_SCALE_STORAGE_KEY = "label-printer:scale-pct";

/** 100×50 mm landscape PDF — QR left, text horizontal, no coordinate remapping. */
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
    label: "0° — landscape (100×50)",
    description:
      "PDF page = 100×50 mm landscape, one label per page. Set the driver media to EXACTLY 100×50 mm landscape. Use when the printer feeds the 100 mm (long) edge across the head.",
  },
  {
    value: 90,
    label: "90° — portrait (50×100)",
    description:
      "PDF page = 50×100 mm portrait, content rotated 90°. Set the driver media to EXACTLY 50×100 mm portrait. Use when the printer feeds the 50 mm (short) edge first — fixes content that prints sideways and drifts across labels at 0°.",
  },
  {
    value: 180,
    label: "180° — landscape flipped (100×50)",
    description:
      "PDF page = 100×50 mm landscape rotated 180°. Driver media stays 100×50 mm landscape. Use when 0° is otherwise correct but the label feeds in upside down.",
  },
  {
    value: 270,
    label: "270° — portrait flipped (50×100)",
    description:
      "PDF page = 50×100 mm portrait, content rotated the opposite way from 90°. Driver media stays 50×100 mm portrait. Try when 90° reads upside down.",
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
