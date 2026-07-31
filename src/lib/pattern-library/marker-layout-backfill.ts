import {
  applyMarkerLayoutSeed,
  resolveMarkerFabricWidthDetails,
  type MarkerFabricWidthOrder,
} from "@/lib/pattern-library/marker-layout";
import { collectNestTudMetadata } from "@/lib/pattern-library/nest-estimate";
import { getGarmentPieces } from "@/lib/sales-orders/label-codes";
import type { ClientPattern } from "@/lib/types/pattern-library";

export type MarkerLayoutBackfillResult = {
  pattern: ClientPattern;
  changed: boolean;
  seeded_layout: boolean;
  filled_width: boolean;
  skipped_reason: string | null;
};

function hasSavedLayout(pattern: ClientPattern): boolean {
  return Boolean(pattern.marker_layout?.placements?.length);
}

function hasSavedWidth(pattern: ClientPattern): boolean {
  return (
    typeof pattern.marker_fabric_width_cm === "number" &&
    Number.isFinite(pattern.marker_fabric_width_cm) &&
    pattern.marker_fabric_width_cm > 0
  );
}

export function patternHasParsableTud(pattern: ClientPattern): boolean {
  return Boolean(
    collectNestTudMetadata(pattern, getGarmentPieces(pattern.garment_type)) ??
      collectNestTudMetadata(pattern, [])
  );
}

/** True when existing TUD patterns still need auto width and/or marker layout. */
export function patternNeedsMarkerBackfill(pattern: ClientPattern): boolean {
  if (!patternHasParsableTud(pattern)) return false;
  return !hasSavedLayout(pattern) || !hasSavedWidth(pattern);
}

/**
 * Seed marker width/layout for one pattern that already has a TUD.
 * Never overwrites a non-empty marker_layout.
 */
export function backfillMarkerLayoutForPattern(
  pattern: ClientPattern,
  options: {
    updated_at?: string;
    hints?: Array<number | null | undefined>;
    salesOrders?: MarkerFabricWidthOrder[];
  } = {}
): MarkerLayoutBackfillResult {
  if (!patternHasParsableTud(pattern)) {
    return {
      pattern,
      changed: false,
      seeded_layout: false,
      filled_width: false,
      skipped_reason: "no_tud",
    };
  }

  const beforeLayout = hasSavedLayout(pattern);
  const beforeWidth = hasSavedWidth(pattern);
  const resolved = resolveMarkerFabricWidthDetails(pattern, {
    hints: options.hints,
    salesOrders: options.salesOrders,
  });

  if (!resolved && !beforeWidth) {
    return {
      pattern,
      changed: false,
      seeded_layout: false,
      filled_width: false,
      skipped_reason: "no_width",
    };
  }

  const next = applyMarkerLayoutSeed(pattern, {
    updated_at: options.updated_at,
    fabric_width_cm: resolved?.width_cm ?? null,
    hints: options.hints,
    salesOrders: options.salesOrders,
  });

  const seeded_layout = !beforeLayout && hasSavedLayout(next);
  const filled_width = !beforeWidth && hasSavedWidth(next);
  const changed =
    seeded_layout ||
    filled_width ||
    next.marker_double_fold !== pattern.marker_double_fold;

  return {
    pattern: changed ? next : pattern,
    changed,
    seeded_layout,
    filled_width,
    skipped_reason: changed ? null : beforeLayout && beforeWidth ? "already_complete" : "unchanged",
  };
}

export function backfillMarkerLayoutsForPatterns(
  patterns: ClientPattern[],
  options: {
    updated_at?: string;
    salesOrders?: MarkerFabricWidthOrder[];
    hintsByPatternId?: Record<string, Array<number | null | undefined>>;
  } = {}
): {
  patterns: ClientPattern[];
  seeded_layout: number;
  filled_width: number;
  skipped_no_tud: number;
  skipped_no_width: number;
  unchanged: number;
} {
  let seeded_layout = 0;
  let filled_width = 0;
  let skipped_no_tud = 0;
  let skipped_no_width = 0;
  let unchanged = 0;

  const nextPatterns = patterns.map((pattern) => {
    const result = backfillMarkerLayoutForPattern(pattern, {
      updated_at: options.updated_at,
      salesOrders: options.salesOrders,
      hints: options.hintsByPatternId?.[pattern.id],
    });
    if (result.seeded_layout) seeded_layout += 1;
    if (result.filled_width) filled_width += 1;
    if (result.skipped_reason === "no_tud") skipped_no_tud += 1;
    else if (result.skipped_reason === "no_width") skipped_no_width += 1;
    else if (!result.changed) unchanged += 1;
    return result.pattern;
  });

  return {
    patterns: nextPatterns,
    seeded_layout,
    filled_width,
    skipped_no_tud,
    skipped_no_width,
    unchanged,
  };
}
