import {
  collectNestTudMetadata,
  effectiveUsableWidthCm,
  estimateNestFromTud,
  type NestEstimateResult,
  type NestPlacement,
} from "@/lib/pattern-library/nest-estimate";
import { getGarmentPieces } from "@/lib/sales-orders/label-codes";
import type {
  ClientPattern,
  MarkerLayout,
  MarkerLayoutPlacement,
} from "@/lib/types/pattern-library";

const SNAP_CM = 0.5;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function snapCm(value: number, step = SNAP_CM): number {
  if (!(Number.isFinite(value))) return 0;
  return round1(Math.round(value / step) * step);
}

export function resolveMarkerFabricWidthCm(pattern: ClientPattern): number | null {
  if (
    typeof pattern.marker_fabric_width_cm === "number" &&
    Number.isFinite(pattern.marker_fabric_width_cm) &&
    pattern.marker_fabric_width_cm > 0
  ) {
    return pattern.marker_fabric_width_cm;
  }
  for (const ref of pattern.linked_fabric_refs ?? []) {
    if (typeof ref.width_cm === "number" && Number.isFinite(ref.width_cm) && ref.width_cm > 0) {
      return ref.width_cm;
    }
  }
  return null;
}

/** Shop default: double fold when Pattern has not answered. */
export function resolveMarkerDoubleFold(pattern: ClientPattern): {
  double_fold: boolean;
  fold_assumed: boolean;
} {
  if (pattern.marker_double_fold === true || pattern.marker_double_fold === false) {
    return { double_fold: pattern.marker_double_fold, fold_assumed: false };
  }
  return { double_fold: true, fold_assumed: true };
}

export function placementToMarker(p: NestPlacement): MarkerLayoutPlacement {
  return {
    id: p.id,
    name: p.name,
    fabric: p.fabric,
    x_cm: p.x_cm,
    y_cm: p.y_cm,
    width_cm: p.width_cm,
    height_cm: p.height_cm,
    rotated: p.rotated,
    secondary: p.secondary,
  };
}

export function recomputeMarkerMetrics(
  placements: MarkerLayoutPlacement[],
  usableWidthCm: number,
  areaM2: number
): { packed_length_m: number; efficiency_pct: number } {
  const lengthCm = Math.max(
    0,
    ...placements.map((p) => p.x_cm + p.width_cm),
    0
  );
  const packed_length_m = round3(lengthCm / 100);
  const usableWidthM = usableWidthCm / 100;
  if (!(usableWidthM > 0) || !(packed_length_m > 0) || !(areaM2 > 0)) {
    return { packed_length_m, efficiency_pct: 0 };
  }
  const efficiency_pct = round2((areaM2 / (usableWidthM * packed_length_m)) * 100);
  return { packed_length_m, efficiency_pct };
}

export function clampPlacement(
  placement: MarkerLayoutPlacement,
  usableWidthCm: number
): MarkerLayoutPlacement {
  const width = Math.max(0.1, placement.width_cm);
  const height = Math.max(0.1, Math.min(placement.height_cm, usableWidthCm));
  const maxY = Math.max(0, usableWidthCm - height);
  return {
    ...placement,
    width_cm: round1(width),
    height_cm: round1(height),
    x_cm: snapCm(Math.max(0, placement.x_cm)),
    y_cm: snapCm(Math.min(Math.max(0, placement.y_cm), maxY)),
  };
}

/** Rotate 90 deg in place (swap w/h), keep top-left clamped to usable width. */
export function rotatePlacement90(
  placement: MarkerLayoutPlacement,
  usableWidthCm: number
): MarkerLayoutPlacement {
  return clampPlacement(
    {
      ...placement,
      width_cm: placement.height_cm,
      height_cm: placement.width_cm,
      rotated: !placement.rotated,
    },
    usableWidthCm
  );
}

export function layoutFromNestEstimate(
  nest: NestEstimateResult,
  options: { source: "auto" | "manual"; updated_at?: string } = { source: "auto" }
): MarkerLayout {
  const placements = nest.placements.map(placementToMarker);
  const metrics = recomputeMarkerMetrics(
    placements,
    nest.usable_width_cm,
    nest.area_m2
  );
  return {
    size: nest.size,
    garment_qty: nest.garment_qty,
    fabric_width_cm: nest.fabric_width_cm,
    double_fold: nest.double_fold,
    usable_width_cm: nest.usable_width_cm,
    area_m2: nest.area_m2,
    packed_length_m: metrics.packed_length_m || nest.packed_length_m,
    efficiency_pct: metrics.efficiency_pct || nest.efficiency_pct,
    placements,
    updated_at: options.updated_at ?? new Date().toISOString(),
    source: options.source,
  };
}

export function nestResultFromMarkerLayout(layout: MarkerLayout): NestEstimateResult {
  return {
    size: layout.size,
    garment_qty: layout.garment_qty,
    fabric_width_cm: layout.fabric_width_cm,
    double_fold: layout.double_fold,
    usable_width_cm: layout.usable_width_cm,
    area_m2: layout.area_m2,
    estimated_length_m: layout.packed_length_m,
    packed_length_m: layout.packed_length_m,
    efficiency_pct: layout.efficiency_pct,
    fabric_breakdown: [],
    placements: layout.placements.map((p) => ({ ...p })),
    disclaimer:
      layout.source === "manual"
        ? "Saved marker layout (approximate from TUD areas) - not a TUKAmark CAD marker."
        : "Auto marker from TUD areas - not a TUKAmark CAD marker.",
  };
}

/**
 * Build a seed layout when TUD + width are available.
 * Returns null when inputs are missing or estimate fails.
 */
export function buildAutoMarkerLayout(
  pattern: ClientPattern,
  options: {
    fabric_width_cm?: number | null;
    size?: string | null;
    garment_qty?: number;
    requiredPieceNames?: string[];
    updated_at?: string;
  } = {}
): MarkerLayout | null {
  const width =
    typeof options.fabric_width_cm === "number" && options.fabric_width_cm > 0
      ? options.fabric_width_cm
      : resolveMarkerFabricWidthCm(pattern);
  if (width === null) return null;

  const pieces =
    options.requiredPieceNames ?? getGarmentPieces(pattern.garment_type);
  const tud = collectNestTudMetadata(pattern, pieces);
  if (!tud) return null;

  const { double_fold } = resolveMarkerDoubleFold(pattern);
  const nest = estimateNestFromTud({
    tud,
    fabric_width_cm: width,
    double_fold,
    size: options.size ?? pattern.base_size,
    garment_qty: options.garment_qty ?? 1,
  });
  if (!nest) return null;

  return layoutFromNestEstimate(nest, {
    source: "auto",
    updated_at: options.updated_at,
  });
}

/**
 * Seed marker_layout only when unset. Never overwrites a saved layout.
 * Also fills marker_fabric_width_cm / marker_double_fold when missing.
 */
export function applyMarkerLayoutSeed(
  pattern: ClientPattern,
  options: { updated_at?: string } = {}
): ClientPattern {
  if (pattern.marker_layout && pattern.marker_layout.placements.length > 0) {
    return pattern;
  }

  const layout = buildAutoMarkerLayout(pattern, {
    updated_at: options.updated_at ?? new Date().toISOString(),
  });
  if (!layout) return pattern;

  return {
    ...pattern,
    marker_fabric_width_cm:
      pattern.marker_fabric_width_cm != null && pattern.marker_fabric_width_cm > 0
        ? pattern.marker_fabric_width_cm
        : layout.fabric_width_cm,
    marker_double_fold:
      pattern.marker_double_fold === true || pattern.marker_double_fold === false
        ? pattern.marker_double_fold
        : layout.double_fold,
    marker_layout: layout,
  };
}

export function sanitizeMarkerLayout(value: unknown): MarkerLayout | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!value || typeof value !== "object") return undefined;

  const raw = value as Record<string, unknown>;
  const size = typeof raw.size === "string" ? raw.size.trim() : "";
  const garment_qty = Math.max(1, Math.floor(Number(raw.garment_qty)) || 1);
  const fabric_width_cm = Number(raw.fabric_width_cm);
  const double_fold = raw.double_fold === true || raw.double_fold === false
    ? raw.double_fold
    : null;
  const usable_width_cm = Number(raw.usable_width_cm);
  const area_m2 = Number(raw.area_m2);
  const source = raw.source === "manual" ? "manual" : "auto";

  if (!size || !(fabric_width_cm > 0) || double_fold === null) {
    return undefined;
  }

  const usable =
    usable_width_cm > 0
      ? usable_width_cm
      : effectiveUsableWidthCm(fabric_width_cm, double_fold);

  const placementsRaw = Array.isArray(raw.placements) ? raw.placements : [];
  const placements: MarkerLayoutPlacement[] = [];
  for (const item of placementsRaw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const id = typeof p.id === "string" ? p.id.trim() : "";
    const name = typeof p.name === "string" ? p.name.trim() : "";
    const x_cm = Number(p.x_cm);
    const y_cm = Number(p.y_cm);
    const width_cm = Number(p.width_cm);
    const height_cm = Number(p.height_cm);
    if (!id || !name || !(width_cm > 0) || !(height_cm > 0)) continue;
    placements.push(
      clampPlacement(
        {
          id,
          name,
          fabric: typeof p.fabric === "string" ? p.fabric : null,
          x_cm: Number.isFinite(x_cm) ? x_cm : 0,
          y_cm: Number.isFinite(y_cm) ? y_cm : 0,
          width_cm,
          height_cm,
          rotated: p.rotated === true,
          secondary: p.secondary === true,
        },
        usable
      )
    );
  }

  const area = Number.isFinite(area_m2) && area_m2 > 0 ? round3(area_m2) : 0;
  const metrics = recomputeMarkerMetrics(placements, usable, area);
  const packedFromBody = Number(raw.packed_length_m);
  const effFromBody = Number(raw.efficiency_pct);

  return {
    size,
    garment_qty,
    fabric_width_cm: round1(fabric_width_cm),
    double_fold,
    usable_width_cm: round1(usable),
    area_m2: area,
    packed_length_m:
      Number.isFinite(packedFromBody) && packedFromBody >= 0
        ? round3(packedFromBody)
        : metrics.packed_length_m,
    efficiency_pct:
      Number.isFinite(effFromBody) && effFromBody >= 0
        ? round2(effFromBody)
        : metrics.efficiency_pct,
    placements,
    updated_at:
      typeof raw.updated_at === "string" && raw.updated_at.trim()
        ? raw.updated_at.trim()
        : new Date().toISOString(),
    source,
  };
}
