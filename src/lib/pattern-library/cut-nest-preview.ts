import {
  nestResultFromMarkerLayout,
  resolveMarkerDoubleFold,
} from "@/lib/pattern-library/marker-layout";
import {
  collectNestTudMetadata,
  estimateNestFromTud,
  type NestEstimateResult,
} from "@/lib/pattern-library/nest-estimate";
import { getGarmentPieces } from "@/lib/sales-orders/label-codes";
import type { ClientPattern } from "@/lib/types/pattern-library";

export interface CutNestPreview {
  nest: NestEstimateResult | null;
  /** True when double fold was assumed because marker_double_fold was unset. */
  fold_assumed: boolean;
  /** Why nest is missing (for empty-state copy). */
  missing_reason: string | null;
  /** saved = pattern.marker_layout; auto = live packer. */
  source: "saved" | "auto" | null;
}

function layoutMatchesSheet(
  pattern: ClientPattern,
  width: number,
  doubleFold: boolean,
  size: string | null | undefined,
  garmentQty: number
): boolean {
  const layout = pattern.marker_layout;
  if (!layout?.placements?.length) return false;
  if (Math.abs(layout.fabric_width_cm - width) > 0.05) return false;
  if (layout.double_fold !== doubleFold) return false;
  if (layout.garment_qty !== garmentQty) return false;
  const wantSize = (size ?? pattern.base_size ?? "").trim();
  if (wantSize && layout.size && layout.size !== wantSize) return false;
  return true;
}

/**
 * Build the cutter handoff nest preview for a measurement sheet.
 * Prefers saved marker_layout when width/fold/size/qty match; else live estimate.
 * Defaults double fold to yes when Pattern has not answered yet (shop practice).
 */
export function buildCutNestPreview(
  pattern: ClientPattern,
  fabricWidthCm: number | null | undefined,
  options: { size?: string | null; garmentQty?: number } = {}
): CutNestPreview {
  const width =
    typeof fabricWidthCm === "number" && Number.isFinite(fabricWidthCm) && fabricWidthCm > 0
      ? fabricWidthCm
      : typeof pattern.marker_fabric_width_cm === "number" &&
          Number.isFinite(pattern.marker_fabric_width_cm) &&
          pattern.marker_fabric_width_cm > 0
        ? pattern.marker_fabric_width_cm
        : null;

  if (width === null) {
    return {
      nest: null,
      fold_assumed: false,
      missing_reason: "Upload TUD + set fabric width for cut nest preview.",
      source: null,
    };
  }

  const tud = collectNestTudMetadata(pattern, getGarmentPieces(pattern.garment_type));
  if (!tud && !pattern.marker_layout?.placements?.length) {
    return {
      nest: null,
      fold_assumed: false,
      missing_reason: "Upload TUD + set fabric width for cut nest preview.",
      source: null,
    };
  }

  const { double_fold: doubleFold, fold_assumed } = resolveMarkerDoubleFold(pattern);
  const garmentQty = options.garmentQty ?? 1;
  const size = options.size ?? pattern.base_size;

  if (layoutMatchesSheet(pattern, width, doubleFold, size, garmentQty) && pattern.marker_layout) {
    return {
      nest: nestResultFromMarkerLayout(pattern.marker_layout),
      fold_assumed,
      missing_reason: null,
      source: "saved",
    };
  }

  if (!tud) {
    return {
      nest: null,
      fold_assumed,
      missing_reason: "Upload TUD + set fabric width for cut nest preview.",
      source: null,
    };
  }

  const nest = estimateNestFromTud({
    tud,
    fabric_width_cm: width,
    double_fold: doubleFold,
    size,
    garment_qty: garmentQty,
  });

  if (!nest) {
    return {
      nest: null,
      fold_assumed,
      missing_reason: "Could not estimate nest from TUD areas for this size.",
      source: null,
    };
  }

  return { nest, fold_assumed, missing_reason: null, source: "auto" };
}
