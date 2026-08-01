import {
  nestResultFromMarkerLayout,
  resolveMarkerDoubleFold,
  resolveMarkerFabricWidthCm,
} from "@/lib/pattern-library/marker-layout";
import {
  collectNestDxfMetadata,
  collectNestTudMetadata,
  estimateNestFromDxf,
  estimateNestFromMultiPieceSources,
  estimateNestFromTud,
  type NestEstimateResult,
} from "@/lib/pattern-library/nest-estimate";
import {
  buildCutterPlanFromTud,
  type CutterTudPlan,
} from "@/lib/pattern-library/tud-cutter-plan";
import { getGarmentPieces } from "@/lib/sales-orders/label-codes";
import type { ClientPattern } from "@/lib/types/pattern-library";

export interface CutNestPreview {
  nest: NestEstimateResult | null;
  /** Parts list read from TUD header for the cutter. */
  cutter_plan: CutterTudPlan | null;
  /** Ordered fabric meters from SO line (null when unknown). */
  ordered_length_m: number | null;
  /** Fabric strip length drawn on the board (max ordered, packed). */
  board_length_m: number | null;
  /** Whether packed length fits on ordered meters (null if ordered unknown). */
  fits_on_order: boolean | null;
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

function positiveMeters(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !(n > 0)) return null;
  return Math.round(n * 1000) / 1000;
}

/** Convert SO fabric-line quantity to meters when unit is meters-like. */
export function metersFromFabricLineQuantity(
  quantity: number | null | undefined,
  unit: string | null | undefined
): number | null {
  const qty = positiveMeters(quantity);
  if (qty === null) return null;
  const u = (unit ?? "meters").trim().toLowerCase();
  if (!u || u === "m" || u === "meter" || u === "meters" || u === "mt" || u === "mtr") {
    return qty;
  }
  return null;
}

function withBoardFields(
  base: Omit<CutNestPreview, "ordered_length_m" | "board_length_m" | "fits_on_order">,
  nest: NestEstimateResult | null,
  orderedLengthM: number | null
): CutNestPreview {
  const packed = nest?.packed_length_m ?? null;
  const ordered = positiveMeters(orderedLengthM);
  const board =
    packed != null || ordered != null
      ? Math.max(packed ?? 0, ordered ?? 0) || null
      : null;
  const fits =
    ordered != null && packed != null ? packed <= ordered + 1e-6 : null;
  return {
    ...base,
    nest,
    ordered_length_m: ordered,
    board_length_m: board,
    fits_on_order: fits,
  };
}

/**
 * Build the cutter handoff nest preview for a measurement sheet.
 * Places TUD piece rects on fabric width without overlap; board uses ordered meters when known.
 */
export function buildCutNestPreview(
  pattern: ClientPattern,
  fabricWidthCm: number | null | undefined,
  options: {
    size?: string | null;
    garmentQty?: number;
    ordered_length_m?: number | null;
  } = {}
): CutNestPreview {
  const width =
    typeof fabricWidthCm === "number" && Number.isFinite(fabricWidthCm) && fabricWidthCm > 0
      ? fabricWidthCm
      : resolveMarkerFabricWidthCm(pattern);

  const dxf = collectNestDxfMetadata(pattern);
  const tud =
    collectNestTudMetadata(pattern, getGarmentPieces(pattern.garment_type)) ??
    collectNestTudMetadata(pattern, []);
  const { double_fold: doubleFold, fold_assumed } = resolveMarkerDoubleFold(pattern);
  const garmentQty = options.garmentQty ?? 1;
  const size = options.size ?? pattern.base_size;
  const ordered = positiveMeters(options.ordered_length_m);
  const cutter_plan = tud
    ? buildCutterPlanFromTud(tud, { size, double_fold: doubleFold })
    : null;
  const hasGeometry = Boolean(dxf?.pieces?.length || tud);

  if (width === null) {
    return withBoardFields(
      {
        nest: null,
        cutter_plan,
        fold_assumed: false,
        missing_reason: cutter_plan
          ? "Set fabric width for fabric cut layout (parts list below from TUD)."
          : dxf?.pieces?.length
            ? "Set fabric width for fabric cut layout (DXF outlines ready)."
            : "Upload DXF or TUD + set fabric width for fabric cut layout.",
        source: null,
      },
      null,
      ordered
    );
  }

  if (!hasGeometry && !pattern.marker_layout?.placements?.length) {
    return withBoardFields(
      {
        nest: null,
        cutter_plan: null,
        fold_assumed: false,
        missing_reason: "Upload DXF or TUD + set fabric width for fabric cut layout.",
        source: null,
      },
      null,
      ordered
    );
  }

  if (layoutMatchesSheet(pattern, width, doubleFold, size, garmentQty) && pattern.marker_layout) {
    // Stale saved boards (e.g. front+back only) must not hide newly derived belt pieces.
    const savedNames = new Set(
      pattern.marker_layout.placements.map((p) => p.name.trim().toLowerCase())
    );
    const dxfMissingFromSaved =
      dxf?.pieces.some((p) => !savedNames.has(p.name.trim().toLowerCase())) ?? false;
    if (!dxfMissingFromSaved) {
      const nest = nestResultFromMarkerLayout(pattern.marker_layout);
      return withBoardFields(
        {
          nest,
          cutter_plan,
          fold_assumed,
          missing_reason: null,
          source: "saved",
        },
        nest,
        ordered
      );
    }
  }

  const pieceNames = getGarmentPieces(pattern.garment_type);
  if (pieceNames.length > 1) {
    const mixed = estimateNestFromMultiPieceSources({
      pattern,
      fabric_width_cm: width,
      double_fold: doubleFold,
      size,
      garment_qty: garmentQty,
      requiredPieceNames: pieceNames,
    });
    if (mixed) {
      return withBoardFields(
        {
          nest: mixed,
          cutter_plan,
          fold_assumed,
          missing_reason: null,
          source: "auto",
        },
        mixed,
        ordered
      );
    }
  }

  if (dxf?.pieces?.length) {
    const nest = estimateNestFromDxf({
      dxf,
      fabric_width_cm: width,
      double_fold: doubleFold,
      size,
      garment_qty: garmentQty,
    });
    if (nest) {
      return withBoardFields(
        {
          nest,
          cutter_plan,
          fold_assumed,
          missing_reason: null,
          source: "auto",
        },
        nest,
        ordered
      );
    }
  }

  if (!tud) {
    return withBoardFields(
      {
        nest: null,
        cutter_plan: null,
        fold_assumed,
        missing_reason: "Upload DXF or TUD + set fabric width for fabric cut layout.",
        source: null,
      },
      null,
      ordered
    );
  }

  const nest = estimateNestFromTud({
    tud,
    fabric_width_cm: width,
    double_fold: doubleFold,
    size,
    garment_qty: garmentQty,
  });

  if (!nest) {
    return withBoardFields(
      {
        nest: null,
        cutter_plan,
        fold_assumed,
        missing_reason: "Could not place TUD pieces for this size.",
        source: null,
      },
      null,
      ordered
    );
  }

  return withBoardFields(
    {
      nest,
      cutter_plan,
      fold_assumed,
      missing_reason: null,
      source: "auto",
    },
    nest,
    ordered
  );
}
