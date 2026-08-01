import { augmentDxfWithDerivedBelt } from "@/lib/pattern-library/derived-belt";
import { findActiveDxfAttachmentForPiece } from "@/lib/pattern-library/multi-piece-geometry";
import {
  findActiveTudAttachment,
  findActiveTudAttachmentForPiece,
} from "@/lib/pattern-library/tud-versions";
import { getGarmentPieces } from "@/lib/sales-orders/label-codes";
import type {
  ClientPattern,
  DxfMetadata,
  PatternLibraryAttachment,
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
  /** Canonical (unrotated) DXF outline in local cm. */
  outline_cm?: Array<{ x: number; y: number }> | null;
  outline_width_cm?: number | null;
  geometry_source?: "dxf" | "tud_estimate" | null;
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
  outline_cm?: Array<{ x: number; y: number }> | null;
  outline_width_cm?: number | null;
  geometry_source?: "dxf" | "tud_estimate" | null;
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
  /** True when placements carry real DXF outlines (not TUD area rects). */
  has_dxf_outlines?: boolean;
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

/** Latest uploaded DXF attachment with parsed piece outlines. */
export function findActiveDxfAttachment(
  pattern: ClientPattern
): PatternLibraryAttachment | null {
  const withDxf = pattern.files
    .filter((f) => f.kind === "dxf" && f.dxf?.pieces?.length)
    .slice()
    .sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1));
  return withDxf[0] ?? null;
}

export function collectNestDxfMetadata(pattern: ClientPattern): DxfMetadata | null {
  const dxf = findActiveDxfAttachment(pattern)?.dxf ?? null;
  if (!dxf) return null;
  // AAMA DXF exports often omit the waistband strip that TUKAmark still nests.
  return augmentDxfWithDerivedBelt(dxf, pattern);
}

/** Merge active TUD metadata across piece slots (or single active TUD). */
export function collectNestTudMetadata(
  pattern: ClientPattern,
  requiredPieceNames: string[] = []
): TudMetadata | null {
  const pieces = requiredPieceNames.map((n) => n.trim()).filter(Boolean);

  // Single garment / unscoped: use the active TUD as-is (no rename).
  if (pieces.length <= 1) {
    const active =
      pieces.length === 1
        ? findActiveTudAttachmentForPiece(pattern, pieces[0]!) ??
          findActiveTudAttachment(pattern)
        : findActiveTudAttachment(pattern);
    return active?.tud ?? null;
  }

  const mergedPieces: TudPiece[] = [];
  const sizes: string[] = [];
  const fabricTotals: TudFabricTotal[] = [];
  let styleCaption: string | null = null;
  let sourcePath: string | null = null;
  let attachmentCount = 0;

  // Multi-piece shells (Suit, Overshirt+Trouser, …): keep piece slots separate.
  // Bare names like BACK collide across garments — prefix and never sum qtys.
  for (const pieceName of pieces) {
    const att = findActiveTudAttachmentForPiece(pattern, pieceName);
    if (!att?.tud) continue;
    attachmentCount += 1;
    const tud = att.tud;
    if (!styleCaption) styleCaption = tud.style_caption;
    if (!sourcePath) sourcePath = tud.source_path;
    for (const size of tud.sizes) {
      if (!sizes.includes(size)) sizes.push(size);
    }
    for (const piece of tud.pieces) {
      const name = `${pieceName}: ${piece.name}`;
      const existing = mergedPieces.find((p) => p.name === name);
      if (!existing) {
        mergedPieces.push({
          name,
          code: piece.code ?? null,
          cut_quantity: piece.cut_quantity,
          fabric: piece.fabric,
          per_size: { ...piece.per_size },
        });
      } else {
        // Same slot + same part name only (true duplicate inside one TUD).
        if (piece.cut_quantity !== null) {
          existing.cut_quantity = (existing.cut_quantity ?? 0) + piece.cut_quantity;
        }
        existing.fabric = existing.fabric ?? piece.fabric;
        existing.code = existing.code ?? piece.code ?? null;
        for (const [size, entry] of Object.entries(piece.per_size)) {
          existing.per_size[size] = entry;
        }
      }
    }
    fabricTotals.push(...tud.fabric_totals);
  }

  if (attachmentCount === 0 || mergedPieces.length === 0) return null;

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
        geometry_source: "tud_estimate",
      });
    }
  }

  // Largest first helps shelf packing.
  rects.sort(
    (a, b) => b.width_cm * b.height_cm - a.width_cm * a.height_cm || a.name.localeCompare(b.name)
  );
  return rects;
}

/** Build cut rectangles + outlines from parsed DXF pieces. */
export function buildNestRectsFromDxf(
  dxf: DxfMetadata,
  garmentQty: number,
  options: { includeSecondary?: boolean; size?: string | null } = {}
): NestRect[] {
  const includeSecondary = options.includeSecondary === true;
  const qty = Math.max(1, Math.floor(garmentQty) || 1);
  const wantSize = options.size?.trim() || null;
  const rects: NestRect[] = [];
  let seq = 0;

  for (const piece of dxf.pieces) {
    if (wantSize && piece.size && piece.size !== wantSize) continue;
    if (!(piece.width_cm > 0) || !(piece.height_cm > 0)) continue;
    if (!piece.outline_cm?.length) continue;

    const secondary = !isShellFabric(piece.fabric);
    if (secondary && !includeSecondary) continue;

    const copies = Math.max(1, piece.cut_quantity ?? 1) * qty;
    for (let i = 0; i < copies; i++) {
      seq += 1;
      rects.push({
        id: `${piece.name}-${seq}`,
        name: piece.name,
        fabric: piece.fabric,
        width_cm: round1(piece.width_cm),
        height_cm: round1(piece.height_cm),
        secondary,
        outline_cm: piece.outline_cm.map((p) => ({ x: p.x, y: p.y })),
        outline_width_cm: round1(piece.width_cm),
        geometry_source: "dxf",
      });
    }
  }

  rects.sort(
    (a, b) => b.width_cm * b.height_cm - a.width_cm * a.height_cm || a.name.localeCompare(b.name)
  );
  return rects;
}

function orientNestRect(
  rect: NestRect,
  usableWidthCm: number
): { width_cm: number; height_cm: number; rotated: boolean } {
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
}

/** Long thin strips (belt / waistband) - nest along length like TUKAmark. */
function isStripRect(rect: NestRect, usableWidthCm: number): boolean {
  const longSide = Math.max(rect.width_cm, rect.height_cm);
  const shortSide = Math.min(rect.width_cm, rect.height_cm);
  if (!(shortSide > 0) || !(longSide > 0)) return false;
  if (longSide / shortSide < 5) return false;
  // Strip must fit across the usable width on its thin side.
  return shortSide <= usableWidthCm * 0.35 + 1e-6;
}

function placementFromRect(
  rect: NestRect,
  x_cm: number,
  y_cm: number,
  width_cm: number,
  height_cm: number,
  rotated: boolean
): NestPlacement {
  return {
    id: rect.id,
    name: rect.name,
    fabric: rect.fabric,
    x_cm: round1(x_cm),
    y_cm: round1(y_cm),
    width_cm: round1(width_cm),
    height_cm: round1(height_cm),
    rotated,
    secondary: rect.secondary,
    outline_cm: rect.outline_cm ?? null,
    outline_width_cm: rect.outline_width_cm ?? rect.width_cm,
    geometry_source: rect.geometry_source ?? null,
  };
}

/**
 * Shelf / row bin-pack into usable width. Allows 0 or 90 deg rotation when both fit.
 * x runs along fabric length; y across usable width.
 * Long thin strips (belt) are reserved as a top lane so body pieces nest under them
 * (same strategy TUKAmark uses for waistband strips).
 */
export function packNestRects(
  rects: NestRect[],
  usableWidthCm: number
): { placements: NestPlacement[]; packed_length_cm: number } {
  if (!(usableWidthCm > 0) || rects.length === 0) {
    return { placements: [], packed_length_cm: 0 };
  }

  const strips = rects.filter((r) => isStripRect(r, usableWidthCm));
  const bodies = rects.filter((r) => !isStripRect(r, usableWidthCm));

  // Orient strips with the thin side across fabric width.
  let stripLaneH = 0;
  const stripOrients = strips.map((rect) => {
    const thin = Math.min(rect.width_cm, rect.height_cm);
    const long = Math.max(rect.width_cm, rect.height_cm);
    const rotated = rect.width_cm < rect.height_cm;
    stripLaneH += thin;
    return { rect, width_cm: long, height_cm: thin, rotated };
  });

  const bodyUsable =
    strips.length > 0
      ? Math.max(1, usableWidthCm - stripLaneH)
      : usableWidthCm;

  let cursorX = 0;
  let shelfHeight = 0;
  let shelfUsedY = 0;
  let maxX = 0;
  const bodyPlacements: NestPlacement[] = [];

  for (const rect of bodies) {
    const o = orientNestRect(rect, bodyUsable);

    if (shelfUsedY > 0 && shelfUsedY + o.height_cm > bodyUsable + 1e-6) {
      cursorX += shelfHeight;
      shelfHeight = 0;
      shelfUsedY = 0;
    }

    bodyPlacements.push(
      placementFromRect(
        rect,
        cursorX,
        stripLaneH + shelfUsedY,
        o.width_cm,
        o.height_cm,
        o.rotated
      )
    );

    shelfUsedY += o.height_cm;
    shelfHeight = Math.max(shelfHeight, o.width_cm);
    maxX = Math.max(maxX, cursorX + o.width_cm);
  }

  maxX = Math.max(maxX, cursorX + shelfHeight);
  const bodyLength = maxX;

  const stripPlacements: NestPlacement[] = [];
  let stripY = 0;
  let stripLength = bodyLength;
  for (const s of stripOrients) {
    stripLength = Math.max(stripLength, s.width_cm);
  }
  for (const s of stripOrients) {
    stripPlacements.push(
      placementFromRect(s.rect, 0, stripY, stripLength, s.height_cm, s.rotated)
    );
    // Stretch outline to the placed length when we elongated the strip lane.
    const last = stripPlacements[stripPlacements.length - 1]!;
    if (
      last.outline_cm &&
      last.outline_cm.length >= 3 &&
      Math.abs(stripLength - s.width_cm) > 0.05
    ) {
      const scaleX = stripLength / Math.max(s.width_cm, 1e-6);
      last.outline_cm = last.outline_cm.map((p) => ({
        x: round1(p.x * scaleX),
        y: p.y,
      }));
      last.outline_width_cm = stripLength;
      last.width_cm = round1(stripLength);
    }
    stripY += s.height_cm;
  }

  const placements = [...stripPlacements, ...bodyPlacements];
  const packed = Math.max(
    bodyLength,
    ...stripPlacements.map((p) => p.x_cm + p.width_cm),
    0
  );
  return { placements, packed_length_cm: round1(packed) };
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
    has_dxf_outlines: false,
    disclaimer:
      "Approximate from TUD areas - verify in TUKAmark before cutting. Not a CAD cutting marker.",
  };
}

export function resolveNestSizeFromDxf(
  dxf: DxfMetadata,
  preferredSize?: string | null
): string | null {
  const preferred = preferredSize?.trim() || null;
  if (preferred && dxf.sizes.includes(preferred)) return preferred;
  if (dxf.sizes.length === 1) return dxf.sizes[0]!;
  const fromPieces = dxf.pieces.find((p) => p.size)?.size ?? null;
  return fromPieces ?? dxf.sizes[0] ?? null;
}

/** Pack arbitrary nest rects (DXF outlines and/or TUD area estimates). */
export function estimateNestFromRects(input: {
  rects: NestRect[];
  fabric_width_cm: number;
  double_fold: boolean;
  size: string;
  garment_qty: number;
  disclaimer: string;
}): NestEstimateResult | null {
  const width = input.fabric_width_cm;
  if (!(width > 0) || input.rects.length === 0) return null;

  const usableWidthCm = effectiveUsableWidthCm(width, input.double_fold);
  if (!(usableWidthCm > 0)) return null;

  const packed = packNestRects(input.rects, usableWidthCm);
  const areaM2 = round3(
    input.rects.reduce((sum, r) => {
      if (r.outline_cm && r.outline_cm.length >= 3) {
        let a = 0;
        const pts = r.outline_cm;
        for (let i = 0; i < pts.length; i++) {
          const p0 = pts[i]!;
          const p1 = pts[(i + 1) % pts.length]!;
          a += p0.x * p1.y - p1.x * p0.y;
        }
        return sum + Math.abs(a) / 2 / 10_000;
      }
      return sum + (r.width_cm * r.height_cm) / 10_000;
    }, 0)
  );

  const usableWidthM = usableWidthCm / 100;
  const estimatedLengthM = round3(
    (areaM2 / usableWidthM) * (1 + NEST_ESTIMATE_WASTE_FACTOR)
  );
  const packedLengthM = round3(packed.packed_length_cm / 100);
  const lengthForEff = Math.max(packedLengthM, estimatedLengthM, 1e-6);
  const efficiencyPct = round2((areaM2 / (usableWidthM * lengthForEff)) * 100);

  const byFabric = new Map<string, number>();
  for (const r of input.rects) {
    const key = r.fabric?.trim() || "SHEEL";
    const pieceArea = (r.width_cm * r.height_cm) / 10_000;
    byFabric.set(key, (byFabric.get(key) ?? 0) + pieceArea);
  }
  const fabric_breakdown: NestFabricBreakdown[] = [];
  for (const [fabric, area] of byFabric) {
    fabric_breakdown.push({
      fabric,
      area_m2: round3(area),
      estimated_length_m: round3((area / usableWidthM) * (1 + NEST_ESTIMATE_WASTE_FACTOR)),
    });
  }

  const hasDxf = input.rects.some(
    (r) => r.geometry_source === "dxf" && (r.outline_cm?.length ?? 0) >= 3
  );

  return {
    size: input.size,
    garment_qty: input.garment_qty,
    fabric_width_cm: width,
    double_fold: input.double_fold,
    usable_width_cm: round1(usableWidthCm),
    area_m2: areaM2,
    estimated_length_m: estimatedLengthM,
    packed_length_m: packedLengthM,
    efficiency_pct: efficiencyPct,
    fabric_breakdown,
    placements: packed.placements,
    has_dxf_outlines: hasDxf,
    disclaimer: input.disclaimer,
  };
}

/**
 * Multi-piece nest: per garment piece prefer DXF outlines, else that piece's TUD.
 * Avoids jacket-DXF-only nests that drop trouser TUD pieces.
 */
export function estimateNestFromMultiPieceSources(input: {
  pattern: ClientPattern;
  fabric_width_cm: number;
  double_fold: boolean;
  size?: string | null;
  garment_qty?: number;
  include_secondary?: boolean;
  requiredPieceNames?: string[];
}): NestEstimateResult | null {
  const pieces =
    (input.requiredPieceNames?.length
      ? input.requiredPieceNames
      : getGarmentPieces(input.pattern.garment_type)
    )
      .map((n) => n.trim())
      .filter(Boolean);
  if (pieces.length <= 1) return null;

  const garmentQty = Math.max(1, Math.floor(input.garment_qty ?? 1) || 1);
  const includeSecondary = input.include_secondary === true;
  const rects: NestRect[] = [];
  const sizeLabels: string[] = [];
  let usedDxf = false;
  let usedTud = false;

  for (const piece of pieces) {
    const dxfAtt = findActiveDxfAttachmentForPiece(input.pattern, piece);
    if (dxfAtt?.dxf?.pieces?.length) {
      const size = resolveNestSizeFromDxf(dxfAtt.dxf, input.size) ?? "DXF";
      if (size !== "DXF") sizeLabels.push(size);
      const pieceRects = buildNestRectsFromDxf(dxfAtt.dxf, garmentQty, {
        includeSecondary,
        size: size === "DXF" ? null : size,
      }).map((rect, index) => ({
        ...rect,
        id: `${piece}-${rect.id}-${index}`,
        name: `${piece}: ${rect.name}`,
      }));
      if (pieceRects.length > 0) {
        rects.push(...pieceRects);
        usedDxf = true;
        continue;
      }
    }

    const tudAtt = findActiveTudAttachmentForPiece(input.pattern, piece);
    if (!tudAtt?.tud) continue;
    const size = resolveNestSize(tudAtt.tud, input.size);
    if (!size) continue;
    sizeLabels.push(size);
    const pieceRects = buildNestRects(tudAtt.tud, size, garmentQty, {
      includeSecondary,
    }).map((rect, index) => ({
      ...rect,
      id: `${piece}-${rect.id}-${index}`,
      name: `${piece}: ${rect.name}`,
    }));
    if (pieceRects.length > 0) {
      rects.push(...pieceRects);
      usedTud = true;
    }
  }

  if (rects.length === 0) return null;

  const preferred = input.size?.trim() || null;
  const size =
    (preferred && sizeLabels.includes(preferred) ? preferred : null) ??
    sizeLabels[0] ??
    preferred ??
    "MIXED";

  const disclaimer =
    usedDxf && usedTud
      ? "Mixed nest: DXF outlines where available, TUD area estimates for other pieces. Verify in TUKAmark before cutting."
      : usedDxf
        ? "Piece outlines from DXF polylines. Shelf packing uses bounding boxes - verify nest in TUKAmark before cutting."
        : "Approximate from TUD areas - verify in TUKAmark before cutting. Not a CAD cutting marker.";

  return estimateNestFromRects({
    rects,
    fabric_width_cm: input.fabric_width_cm,
    double_fold: input.double_fold,
    size,
    garment_qty: garmentQty,
    disclaimer,
  });
}

/** Nest real DXF outlines onto fabric width (bbox shelf packer). */
export function estimateNestFromDxf(input: {
  dxf: DxfMetadata;
  fabric_width_cm: number;
  double_fold: boolean;
  size?: string | null;
  garment_qty?: number;
  include_secondary?: boolean;
}): NestEstimateResult | null {
  const width = input.fabric_width_cm;
  if (!(width > 0)) return null;

  const size = resolveNestSizeFromDxf(input.dxf, input.size) ?? "DXF";
  const garmentQty = Math.max(1, Math.floor(input.garment_qty ?? 1) || 1);

  const rects = buildNestRectsFromDxf(input.dxf, garmentQty, {
    includeSecondary: input.include_secondary === true,
    size: size === "DXF" ? null : size,
  });
  if (rects.length === 0) return null;

  return estimateNestFromRects({
    rects,
    fabric_width_cm: width,
    double_fold: input.double_fold,
    size,
    garment_qty: garmentQty,
    disclaimer:
      "Piece outlines from DXF polylines. Shelf packing uses bounding boxes - verify nest in TUKAmark before cutting.",
  });
}

/** Convenience: estimate from a client pattern + nest fields. Prefers DXF outlines. */
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

  const mixed = estimateNestFromMultiPieceSources({
    pattern,
    fabric_width_cm: width,
    double_fold: fold,
    size: options.size ?? pattern.base_size,
    garment_qty: options.garment_qty,
    include_secondary: options.include_secondary,
    requiredPieceNames: options.requiredPieceNames,
  });
  if (mixed) return mixed;

  const dxf = collectNestDxfMetadata(pattern);
  if (dxf?.pieces?.length) {
    return estimateNestFromDxf({
      dxf,
      fabric_width_cm: width,
      double_fold: fold,
      size: options.size ?? pattern.base_size,
      garment_qty: options.garment_qty,
      include_secondary: options.include_secondary,
    });
  }

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
