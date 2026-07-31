import {
  findActiveTudAttachment,
  findActiveTudAttachmentForPiece,
} from "@/lib/pattern-library/tud-versions";
import type {
  ClientPattern,
  TudFabricTotal,
  TudMetadata,
  TudPiece,
} from "@/lib/types/pattern-library";

/** Extra length allowance on area-based meter estimate (not CAD waste). */
export const NEST_ESTIMATE_WASTE_FACTOR = 0.1;

export interface NestRect {
  id: string;
  name: string;
  fabric: string | null;
  width_cm: number;
  height_cm: number;
  /** True when this copy is a secondary/fusing piece. */
  secondary: boolean;
}

export interface NestPlacement {
  id: string;
  name: string;
  fabric: string | null;
  x_cm: number;
  y_cm: number;
  width_cm: number;
  height_cm: number;
  rotated: boolean;
  secondary: boolean;
}

export interface NestFabricBreakdown {
  fabric: string;
  area_m2: number;
  estimated_length_m: number;
}

export interface NestEstimateResult {
  size: string;
  garment_qty: number;
  fabric_width_cm: number;
  double_fold: boolean;
  usable_width_cm: number;
  /** Total shell (or all) area for garment_qty. */
  area_m2: number;
  /** Area-based length with waste factor. */
  estimated_length_m: number;
  /** Packer length from rectangle shelves. */
  packed_length_m: number;
  /** Efficiency vs packed length (0-100). */
  efficiency_pct: number;
  fabric_breakdown: NestFabricBreakdown[];
  placements: NestPlacement[];
  /** Warning when geometry is approximate / incomplete. */
  disclaimer: string;
}

export function effectiveUsableWidthCm(widthCm: number, doubleFold: boolean): number {
  if (!(widthCm > 0)) return 0;
  return doubleFold ? widthCm / 2 : widthCm;
}

/**
 * Approximate a rectangle (cm) from piece area (m2) and perimeter (cm).
 * Solves w*h = A and 2(w+h) ~= P; falls back to a square when degenerate.
 */
export function rectFromAreaPerimeter(areaM2: number, perimeterCm: number): {
  width_cm: number;
  height_cm: number;
} {
  const areaCm2 = areaM2 * 10_000;
  if (!(areaCm2 > 0)) {
    return { width_cm: 1, height_cm: 1 };
  }
  const halfPerim = perimeterCm / 2;
  if (halfPerim > 0) {
    // w+h = S, w*h = A => roots of t^2 - S*t + A = 0
    const disc = halfPerim * halfPerim - 4 * areaCm2;
    if (disc >= 0) {
      const root = Math.sqrt(disc);
      const a = (halfPerim + root) / 2;
      const b = (halfPerim - root) / 2;
      if (a > 0 && b > 0) {
        return {
          width_cm: round1(Math.max(a, b)),
          height_cm: round1(Math.min(a, b)),
        };
      }
    }
  }
  const side = Math.sqrt(areaCm2);
  return { width_cm: round1(side), height_cm: round1(side) };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isShellFabric(fabric: string | null): boolean {
  if (!fabric) return true;
  const u = fabric.toUpperCase();
  if (u === "SHEEL" || u === "SHELL") return true;
  if (u === "FINISH" || u === "FUSING" || u === "CONTASH" || u === "CONTRAST") {
    return false;
  }
  return true;
}

/** Merge active TUD metadata across piece slots (or single active TUD). */
export function collectNestTudMetadata(
  pattern: ClientPattern,
  requiredPieceNames: string[] = []
): TudMetadata | null {
  const pieces = requiredPieceNames.map((n) => n.trim()).filter(Boolean);
  const attachments =
    pieces.length > 1
      ? pieces
          .map((piece) => findActiveTudAttachmentForPiece(pattern, piece))
          .filter((a): a is NonNullable<typeof a> => Boolean(a?.tud))
      : (() => {
          const active = findActiveTudAttachment(pattern);
          return active?.tud ? [active] : [];
        })();

  if (attachments.length === 0) return null;
  if (attachments.length === 1) return attachments[0]!.tud ?? null;

  const mergedPieces: TudPiece[] = [];
  const sizes: string[] = [];
  const fabricTotals: TudFabricTotal[] = [];
  let styleCaption: string | null = null;
  let sourcePath: string | null = null;

  for (const att of attachments) {
    const tud = att.tud!;
    if (!styleCaption) styleCaption = tud.style_caption;
    if (!sourcePath) sourcePath = tud.source_path;
    for (const size of tud.sizes) {
      if (!sizes.includes(size)) sizes.push(size);
    }
    for (const piece of tud.pieces) {
      const existing = mergedPieces.find((p) => p.name === piece.name);
      if (!existing) {
        mergedPieces.push({
          name: piece.name,
          cut_quantity: piece.cut_quantity,
          fabric: piece.fabric,
          per_size: { ...piece.per_size },
        });
      } else {
        if (piece.cut_quantity !== null) {
          existing.cut_quantity = (existing.cut_quantity ?? 0) + piece.cut_quantity;
        }
        existing.fabric = existing.fabric ?? piece.fabric;
        for (const [size, entry] of Object.entries(piece.per_size)) {
          existing.per_size[size] = entry;
        }
      }
    }
    fabricTotals.push(...tud.fabric_totals);
  }

  // Rebuild size totals from merged pieces.
  const sizeTotals = sizes.map((size) => {
    let area = 0;
    let perimeter = 0;
    let found = false;
    for (const piece of mergedPieces) {
      const entry = piece.per_size[size];
      if (!entry) continue;
      const qty = piece.cut_quantity ?? 1;
      area += entry.area_m2 * qty;
      perimeter += entry.perimeter_cm * qty;
      found = true;
    }
    return found
      ? { size, area_m2: round3(area), perimeter_cm: round2(perimeter) }
      : { size, area_m2: 0, perimeter_cm: 0 };
  }).filter((row) => row.area_m2 > 0);

  const single = sizeTotals.length === 1 ? sizeTotals[0]! : null;
  const totalCut = mergedPieces.reduce<number | null>((sum, piece) => {
    if (piece.cut_quantity === null) return sum;
    return (sum ?? 0) + piece.cut_quantity;
  }, null);

  return {
    style_caption: styleCaption,
    source_path: sourcePath,
    sizes,
    pieces: mergedPieces,
    total_cut_pieces: totalCut,
    fabric_totals: fabricTotals,
    size_totals: sizeTotals,
    total_area_m2: single ? single.area_m2 : null,
    total_perimeter_cm: single ? single.perimeter_cm : null,
  };
}

export function resolveNestSize(tud: TudMetadata, preferredSize?: string | null): string | null {
  const preferred = preferredSize?.trim() || null;
  if (preferred && tud.sizes.includes(preferred)) return preferred;
  if (tud.sizes.length === 1) return tud.sizes[0]!;
  if (tud.size_totals.length === 1) return tud.size_totals[0]!.size;
  return tud.sizes[0] ?? tud.size_totals[0]?.size ?? null;
}

function areaForSize(tud: TudMetadata, size: string): number {
  const total = tud.size_totals.find((row) => row.size === size);
  if (total) return total.area_m2;
  let area = 0;
  for (const piece of tud.pieces) {
    const entry = piece.per_size[size];
    if (!entry) continue;
    area += entry.area_m2 * (piece.cut_quantity ?? 1);
  }
  return area;
}

function shellAreaForSize(tud: TudMetadata, size: string): number {
  const shellTotals = tud.fabric_totals.filter(
    (row) => row.size === size && isShellFabric(row.fabric)
  );
  if (shellTotals.length > 0) {
    return shellTotals.reduce((sum, row) => sum + row.area_m2, 0);
  }
  // Fall back: sum shell pieces only; if none tagged, use grand total.
  let shell = 0;
  let anyShell = false;
  let all = 0;
  for (const piece of tud.pieces) {
    const entry = piece.per_size[size];
    if (!entry) continue;
    const qty = piece.cut_quantity ?? 1;
    const pieceArea = entry.area_m2 * qty;
    all += pieceArea;
    if (isShellFabric(piece.fabric)) {
      shell += pieceArea;
      anyShell = true;
    }
  }
  return anyShell ? shell : all || areaForSize(tud, size);
}

/** Build cut rectangles for the selected size (garment_qty copies of the cut set). */
export function buildNestRects(
  tud: TudMetadata,
  size: string,
  garmentQty: number,
  options: { includeSecondary?: boolean } = {}
): NestRect[] {
  const includeSecondary = options.includeSecondary === true;
  const qty = Math.max(1, Math.floor(garmentQty) || 1);
  const rects: NestRect[] = [];
  let seq = 0;

  for (const piece of tud.pieces) {
    const entry = piece.per_size[size];
    if (!entry || !(entry.area_m2 > 0)) continue;
    const secondary = !isShellFabric(piece.fabric);
    if (secondary && !includeSecondary) continue;

    const { width_cm, height_cm } = rectFromAreaPerimeter(
      entry.area_m2,
      entry.perimeter_cm
    );
    const copies = Math.max(1, piece.cut_quantity ?? 1) * qty;
    for (let i = 0; i < copies; i++) {
      seq += 1;
      rects.push({
        id: `${piece.name}-${seq}`,
        name: piece.name,
        fabric: piece.fabric,
        width_cm,
        height_cm,
        secondary,
      });
    }
  }

  // Largest first helps shelf packing.
  rects.sort(
    (a, b) => b.width_cm * b.height_cm - a.width_cm * a.height_cm || a.name.localeCompare(b.name)
  );
  return rects;
}

/**
 * Shelf / row bin-pack into usable width. Allows 0 or 90 deg rotation when both fit.
 * x runs along fabric length; y across usable width.
 */
export function packNestRects(
  rects: NestRect[],
  usableWidthCm: number
): { placements: NestPlacement[]; packed_length_cm: number } {
  if (!(usableWidthCm > 0) || rects.length === 0) {
    return { placements: [], packed_length_cm: 0 };
  }

  let cursorX = 0;
  let shelfHeight = 0;
  let shelfUsedY = 0;
  let maxX = 0;
  const placements: NestPlacement[] = [];

  const orient = (
    rect: NestRect
  ): { width_cm: number; height_cm: number; rotated: boolean } | null => {
    const fits0 = rect.height_cm <= usableWidthCm + 1e-6;
    const fits90 = rect.width_cm <= usableWidthCm + 1e-6;
    if (fits0 && fits90) {
      // Prefer orientation that is shorter along length (smaller width_cm in pack space).
      if (rect.width_cm <= rect.height_cm) {
        return { width_cm: rect.width_cm, height_cm: rect.height_cm, rotated: false };
      }
      return { width_cm: rect.height_cm, height_cm: rect.width_cm, rotated: true };
    }
    if (fits0) {
      return { width_cm: rect.width_cm, height_cm: rect.height_cm, rotated: false };
    }
    if (fits90) {
      return { width_cm: rect.height_cm, height_cm: rect.width_cm, rotated: true };
    }
    // Piece wider than fabric: still place, clamped visually by using width as length.
    return {
      width_cm: Math.max(rect.width_cm, rect.height_cm),
      height_cm: Math.min(rect.width_cm, rect.height_cm, usableWidthCm),
      rotated: rect.width_cm > usableWidthCm,
    };
  };

  for (const rect of rects) {
    const o = orient(rect);
    if (!o) continue;

    if (shelfUsedY > 0 && shelfUsedY + o.height_cm > usableWidthCm + 1e-6) {
      cursorX += shelfHeight;
      shelfHeight = 0;
      shelfUsedY = 0;
    }

    placements.push({
      id: rect.id,
      name: rect.name,
      fabric: rect.fabric,
      x_cm: round1(cursorX),
      y_cm: round1(shelfUsedY),
      width_cm: o.width_cm,
      height_cm: o.height_cm,
      rotated: o.rotated,
      secondary: rect.secondary,
    });

    shelfUsedY += o.height_cm;
    shelfHeight = Math.max(shelfHeight, o.width_cm);
    maxX = Math.max(maxX, cursorX + o.width_cm);
  }

  maxX = Math.max(maxX, cursorX + shelfHeight);
  return { placements, packed_length_cm: round1(maxX) };
}

export function estimateNestFromTud(input: {
  tud: TudMetadata;
  fabric_width_cm: number;
  double_fold: boolean;
  size?: string | null;
  garment_qty?: number;
  include_secondary?: boolean;
}): NestEstimateResult | null {
  const width = input.fabric_width_cm;
  if (!(width > 0)) return null;

  const size = resolveNestSize(input.tud, input.size);
  if (!size) return null;

  const garmentQty = Math.max(1, Math.floor(input.garment_qty ?? 1) || 1);
  const usableWidthCm = effectiveUsableWidthCm(width, input.double_fold);
  if (!(usableWidthCm > 0)) return null;

  const unitArea = shellAreaForSize(input.tud, size);
  const areaM2 = unitArea * garmentQty;
  const usableWidthM = usableWidthCm / 100;
  const estimatedLengthM = round3(
    (areaM2 / usableWidthM) * (1 + NEST_ESTIMATE_WASTE_FACTOR)
  );

  const rects = buildNestRects(input.tud, size, garmentQty, {
    includeSecondary: input.include_secondary === true,
  });
  const packed = packNestRects(rects, usableWidthCm);
  const packedLengthM = round3(packed.packed_length_cm / 100);
  const lengthForEff = Math.max(packedLengthM, estimatedLengthM, 1e-6);
  const efficiencyPct = round2((areaM2 / (usableWidthM * lengthForEff)) * 100);

  const fabric_breakdown: NestFabricBreakdown[] = [];
  const byFabric = new Map<string, number>();
  for (const row of input.tud.fabric_totals.filter((r) => r.size === size)) {
    byFabric.set(row.fabric, (byFabric.get(row.fabric) ?? 0) + row.area_m2 * garmentQty);
  }
  if (byFabric.size === 0) {
    byFabric.set("SHELL", areaM2);
  }
  for (const [fabric, area] of byFabric) {
    fabric_breakdown.push({
      fabric,
      area_m2: round3(area),
      estimated_length_m: round3((area / usableWidthM) * (1 + NEST_ESTIMATE_WASTE_FACTOR)),
    });
  }

  return {
    size,
    garment_qty: garmentQty,
    fabric_width_cm: width,
    double_fold: input.double_fold,
    usable_width_cm: round1(usableWidthCm),
    area_m2: round3(areaM2),
    estimated_length_m: estimatedLengthM,
    packed_length_m: packedLengthM,
    efficiency_pct: efficiencyPct,
    fabric_breakdown,
    placements: packed.placements,
    disclaimer:
      "Approximate from TUD areas - verify in TUKAmark before cutting. Not a CAD cutting marker.",
  };
}

/** Convenience: estimate from a client pattern + nest fields. */
export function estimateNestForClientPattern(
  pattern: ClientPattern,
  options: {
    requiredPieceNames?: string[];
    size?: string | null;
    garment_qty?: number;
    include_secondary?: boolean;
  } = {}
): NestEstimateResult | null {
  const width = pattern.marker_fabric_width_cm;
  const fold = pattern.marker_double_fold;
  if (typeof width !== "number" || !(width > 0)) return null;
  if (fold !== true && fold !== false) return null;

  const tud = collectNestTudMetadata(pattern, options.requiredPieceNames ?? []);
  if (!tud) return null;

  return estimateNestFromTud({
    tud,
    fabric_width_cm: width,
    double_fold: fold,
    size: options.size ?? pattern.base_size,
    garment_qty: options.garment_qty,
    include_secondary: options.include_secondary,
  });
}
