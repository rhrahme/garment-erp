import type { DxfMetadata, DxfPiece } from "@/lib/types/pattern-library";

/**
 * ASCII DXF outline parser for TUKA / ANSI-AAMA style exports.
 *
 * Reads BLOCK groups with TEXT labels (Piece Name / Quantity / Size / SHEEL)
 * and POLYLINE+VERTEX (or LWPOLYLINE) contours. For each piece, the largest
 * closed polyline is treated as the cut outline. Coordinates are assumed
 * millimetres when Units: METRIC (TUKA default for this shop).
 *
 * Does not decode binary DXF or spline entities.
 */

export interface ParsedDxfFile {
  metadata: DxfMetadata;
}

export interface Point2 {
  x: number;
  y: number;
}

type DxfEntity = {
  type: string;
  values: Map<number, string[]>;
};

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function first(entity: DxfEntity, code: number): string | null {
  const list = entity.values.get(code);
  return list?.[0] ?? null;
}

function firstNum(entity: DxfEntity, code: number): number | null {
  const raw = first(entity, code);
  if (raw == null) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function allNums(entity: DxfEntity, code: number): number[] {
  const list = entity.values.get(code) ?? [];
  const out: number[] = [];
  for (const raw of list) {
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** Pair group-code / value lines into entities (0 = entity type). */
export function parseDxfEntities(text: string): DxfEntity[] {
  const lines = text.split(/\r?\n/);
  const entities: DxfEntity[] = [];
  let current: DxfEntity | null = null;

  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number.parseInt(lines[i]!.trim(), 10);
    const value = lines[i + 1] ?? "";
    if (!Number.isFinite(code)) continue;

    if (code === 0) {
      if (current) entities.push(current);
      current = { type: value.trim(), values: new Map() };
      continue;
    }
    if (!current) continue;
    const list = current.values.get(code) ?? [];
    list.push(value);
    current.values.set(code, list);
  }
  if (current) entities.push(current);
  return entities;
}

function polyArea(points: Point2[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function polyPerimeter(points: Point2[]): number {
  if (points.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return sum;
}

function closeRing(points: Point2[], eps = 0.5): Point2[] {
  if (points.length < 2) return points;
  const firstPt = points[0]!;
  const last = points[points.length - 1]!;
  if (Math.hypot(firstPt.x - last.x, firstPt.y - last.y) <= eps) {
    return points.slice(0, -1);
  }
  return points;
}

function bboxOf(points: Point2[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function parseLwPolyline(entity: DxfEntity): Point2[] {
  const xs = allNums(entity, 10);
  const ys = allNums(entity, 20);
  const n = Math.min(xs.length, ys.length);
  const pts: Point2[] = [];
  for (let i = 0; i < n; i++) {
    pts.push({ x: xs[i]!, y: ys[i]! });
  }
  return closeRing(pts);
}

type BlockAcc = {
  texts: string[];
  polylines: Point2[][];
  currentVerts: Point2[] | null;
};

function labelValue(texts: string[], prefix: string): string | null {
  const lower = prefix.toLowerCase();
  for (const t of texts) {
    const trimmed = t.trim();
    if (trimmed.toLowerCase().startsWith(lower)) {
      const idx = trimmed.indexOf(":");
      return idx >= 0 ? trimmed.slice(idx + 1).trim() : trimmed.slice(prefix.length).trim();
    }
  }
  return null;
}

function fabricFromTexts(texts: string[]): string | null {
  for (const t of texts) {
    const m = t.trim().match(/^SHEEL\s*:\s*(.+)$/i);
    if (m?.[1]) return m[1].trim();
  }
  // Bare fabric token sometimes appears alone
  for (const t of texts) {
    const u = t.trim().toUpperCase();
    if (u === "SHEEL" || u === "SHELL" || u === "LINING" || u === "FINISH" || u === "CONTASH") {
      return u === "SHELL" ? "SHEEL" : u;
    }
  }
  return null;
}

function unitsFromTexts(texts: string[]): "mm" | "cm" | "in" | null {
  for (const t of texts) {
    const m = t.trim().match(/^Units\s*:\s*(.+)$/i);
    if (!m?.[1]) continue;
    const u = m[1].trim().toUpperCase();
    if (u.includes("METRIC") || u.includes("MM")) return "mm";
    if (u.includes("CM")) return "cm";
    if (u.includes("INCH") || u === "IN") return "in";
  }
  return null;
}

/**
 * Parse an ASCII DXF buffer into named closed piece outlines.
 * Returns null when the buffer does not look like a usable DXF.
 */
export function parseDxfFile(buffer: Buffer): ParsedDxfFile | null {
  const text = buffer.toString("utf8");
  if (!/\bSECTION\b/i.test(text) || !/\b(POLYLINE|LWPOLYLINE)\b/i.test(text)) {
    return null;
  }

  const entities = parseDxfEntities(text);
  const blocks: BlockAcc[] = [];
  let current: BlockAcc | null = null;
  const modelPolys: Point2[][] = [];
  let modelVerts: Point2[] | null = null;
  let inBlock = false;

  const pushVertex = (target: Point2[] | null, entity: DxfEntity) => {
    if (!target) return;
    const x = firstNum(entity, 10);
    const y = firstNum(entity, 20);
    if (x == null || y == null) return;
    target.push({ x, y });
  };

  for (const entity of entities) {
    if (entity.type === "BLOCK") {
      inBlock = true;
      current = { texts: [], polylines: [], currentVerts: null };
      blocks.push(current);
      continue;
    }
    if (entity.type === "ENDBLK") {
      if (current?.currentVerts) {
        current.polylines.push(closeRing(current.currentVerts));
        current.currentVerts = null;
      }
      current = null;
      inBlock = false;
      continue;
    }

    if (entity.type === "TEXT" || entity.type === "MTEXT") {
      const content = first(entity, 1);
      if (content && current) current.texts.push(content);
      continue;
    }

    if (entity.type === "POLYLINE") {
      if (inBlock && current) {
        if (current.currentVerts) {
          current.polylines.push(closeRing(current.currentVerts));
        }
        current.currentVerts = [];
      } else {
        if (modelVerts) modelPolys.push(closeRing(modelVerts));
        modelVerts = [];
      }
      continue;
    }

    if (entity.type === "VERTEX") {
      if (inBlock && current) pushVertex(current.currentVerts, entity);
      else pushVertex(modelVerts, entity);
      continue;
    }

    if (entity.type === "SEQEND") {
      if (inBlock && current?.currentVerts) {
        current.polylines.push(closeRing(current.currentVerts));
        current.currentVerts = null;
      } else if (modelVerts) {
        modelPolys.push(closeRing(modelVerts));
        modelVerts = null;
      }
      continue;
    }

    if (entity.type === "LWPOLYLINE") {
      const pts = parseLwPolyline(entity);
      if (pts.length >= 3) {
        if (inBlock && current) current.polylines.push(pts);
        else modelPolys.push(pts);
      }
    }
  }

  // Global style metadata from any TEXT outside pieces
  const allTexts = entities
    .filter((e) => e.type === "TEXT" || e.type === "MTEXT")
    .map((e) => first(e, 1))
    .filter((t): t is string => Boolean(t));

  const units = unitsFromTexts(allTexts) ?? "mm";
  const toCm = units === "cm" ? 1 : units === "in" ? 2.54 : 0.1; // mm default

  const styleCaption =
    labelValue(allTexts, "Style Name") ??
    labelValue(allTexts, "Style") ??
    null;
  const globalSize = labelValue(allTexts, "Sample Size") ?? labelValue(allTexts, "Size");

  const pieces: DxfPiece[] = [];

  for (const block of blocks) {
    const name = labelValue(block.texts, "Piece Name");
    if (!name) continue;

    const usable = block.polylines.filter((p) => p.length >= 3);
    if (usable.length === 0) continue;

    usable.sort((a, b) => polyArea(b) - polyArea(a));
    const outerMm = usable[0]!;
    const box = bboxOf(outerMm);
    const widthMm = box.maxX - box.minX;
    const heightMm = box.maxY - box.minY;
    if (!(widthMm > 0) || !(heightMm > 0)) continue;

    const outline_cm = outerMm.map((p) => ({
      x: round((p.x - box.minX) * toCm, 3),
      y: round((p.y - box.minY) * toCm, 3),
    }));

    const areaCm2 = polyArea(outline_cm);
    const perimeterCm = polyPerimeter(outline_cm);
    const qtyRaw = labelValue(block.texts, "Quantity");
    const qty = qtyRaw != null ? Number.parseInt(qtyRaw, 10) : NaN;
    const size = labelValue(block.texts, "Size") ?? globalSize;
    const fabric = fabricFromTexts(block.texts);

    pieces.push({
      name,
      cut_quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      fabric,
      size: size?.trim() || null,
      width_cm: round(widthMm * toCm, 2),
      height_cm: round(heightMm * toCm, 2),
      area_m2: round(areaCm2 / 10_000, 4),
      perimeter_cm: round(perimeterCm, 2),
      outline_cm,
    });
  }

  // Fallback: unnamed model-space polylines (rare for TUKA exports)
  if (pieces.length === 0) {
    let idx = 0;
    for (const poly of modelPolys) {
      if (poly.length < 3) continue;
      const box = bboxOf(poly);
      const widthMm = box.maxX - box.minX;
      const heightMm = box.maxY - box.minY;
      if (!(widthMm > 0) || !(heightMm > 0)) continue;
      idx += 1;
      const outline_cm = poly.map((p) => ({
        x: round((p.x - box.minX) * toCm, 3),
        y: round((p.y - box.minY) * toCm, 3),
      }));
      pieces.push({
        name: `PIECE ${idx}`,
        cut_quantity: 1,
        fabric: null,
        size: globalSize,
        width_cm: round(widthMm * toCm, 2),
        height_cm: round(heightMm * toCm, 2),
        area_m2: round(polyArea(outline_cm) / 10_000, 4),
        perimeter_cm: round(polyPerimeter(outline_cm), 2),
        outline_cm,
      });
    }
  }

  if (pieces.length === 0) return null;

  const sizes = Array.from(
    new Set(
      pieces
        .map((p) => p.size)
        .filter((s): s is string => Boolean(s && s.trim()))
        .map((s) => s.trim())
    )
  );
  if (globalSize && !sizes.includes(globalSize)) sizes.unshift(globalSize);

  const totalCut = pieces.reduce((sum, p) => sum + (p.cut_quantity ?? 1), 0);

  return {
    metadata: {
      style_caption: styleCaption,
      units,
      sizes,
      pieces,
      total_cut_pieces: totalCut,
      source: "dxf_polylines",
    },
  };
}

/** Transform canonical (unrotated) outline into placement space. */
export function outlinePointsForPlacement(
  outline_cm: Point2[] | null | undefined,
  placement: { width_cm: number; height_cm: number; rotated: boolean },
  /** Unrotated bbox width (canonical). When omitted, inferred from outline. */
  canonicalWidthCm?: number
): Point2[] | null {
  if (!outline_cm?.length) return null;
  let canonW = canonicalWidthCm;
  if (canonW == null || !(canonW > 0)) {
    canonW = Math.max(...outline_cm.map((p) => p.x), 0.1);
  }

  if (!placement.rotated) {
    return outline_cm.map((p) => ({ x: p.x, y: p.y }));
  }

  // 90-degree CW: (x,y) -> (y, W-x) so dims become H x W
  return outline_cm.map((p) => ({
    x: p.y,
    y: canonW! - p.x,
  }));
}
