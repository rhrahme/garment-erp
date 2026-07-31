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
}

/**
 * Build the cutter handoff nest preview for a measurement sheet.
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
    };
  }

  const tud = collectNestTudMetadata(pattern, getGarmentPieces(pattern.garment_type));
  if (!tud) {
    return {
      nest: null,
      fold_assumed: false,
      missing_reason: "Upload TUD + set fabric width for cut nest preview.",
    };
  }

  const foldAnswered = pattern.marker_double_fold === true || pattern.marker_double_fold === false;
  const doubleFold = foldAnswered ? pattern.marker_double_fold === true : true;
  const fold_assumed = !foldAnswered;

  const nest = estimateNestFromTud({
    tud,
    fabric_width_cm: width,
    double_fold: doubleFold,
    size: options.size ?? pattern.base_size,
    garment_qty: options.garmentQty ?? 1,
  });

  if (!nest) {
    return {
      nest: null,
      fold_assumed,
      missing_reason: "Could not estimate nest from TUD areas for this size.",
    };
  }

  return { nest, fold_assumed, missing_reason: null };
}
