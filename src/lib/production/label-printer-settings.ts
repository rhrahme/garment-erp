import {
  LABEL_ROLL_HEIGHT_MM,
  LABEL_ROLL_WIDTH_MM,
} from "@/lib/production/label-print-config";

/** Clockwise rotation applied to roll layout when generating the PDF. */
export type LabelRotationDeg = 0 | 90 | 180 | 270;

export const LABEL_ROTATION_STORAGE_KEY = "label-printer:rotation-deg";

/** Matches prior portrait per-element mapping (LabelLife 51×102 media). */
export const DEFAULT_LABEL_ROTATION: LabelRotationDeg = 90;

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
