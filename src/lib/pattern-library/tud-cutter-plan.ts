import { rectFromAreaPerimeter, resolveNestSize } from "@/lib/pattern-library/nest-estimate";
import {
  findActiveTudAttachment,
  findActiveTudAttachmentForPiece,
} from "@/lib/pattern-library/tud-versions";
import { tudFabricLabel } from "@/lib/pattern-library/tud-display";
import { getGarmentPieces } from "@/lib/sales-orders/label-codes";
import type { ClientPattern, TudMetadata, TudPiece } from "@/lib/types/pattern-library";

export type CutterFabricRole = "shell" | "lining" | "fusing" | "contrast" | "other";

export interface CutterPiecePlanRow {
  name: string;
  code: string | null;
  cut_quantity: number;
  fabric: string | null;
  fabric_label: string;
  fabric_role: CutterFabricRole;
  area_m2: number;
  perimeter_cm: number;
  /** Approximate rectangle from TUD area + perimeter (not CAD outline). */
  approx_width_cm: number;
  approx_height_cm: number;
  /** How the cutter should treat this piece on folded shell fabric. */
  place_hint: string;
}

export interface CutterTudPlan {
  size: string;
  style_caption: string | null;
  total_cut_pieces: number;
  shell_pieces: CutterPiecePlanRow[];
  other_pieces: CutterPiecePlanRow[];
  /** One-line instruction for the cutter. */
  instruction: string;
  disclaimer: string;
}

function fabricRole(fabric: string | null): CutterFabricRole {
  if (!fabric) return "shell";
  const u = fabric.toUpperCase();
  if (u === "SHEEL" || u === "SHELL") return "shell";
  if (u === "LINING" || u === "LINNING") return "lining";
  if (u === "FINISH" || u === "FUSING") return "fusing";
  if (u === "CONTASH" || u === "CONTRAST") return "contrast";
  return "other";
}

function placeHint(role: CutterFabricRole, doubleFold: boolean): string {
  if (role === "shell") {
    return doubleFold
      ? "Shell - place printed part on fold, then cut"
      : "Shell - place on open fabric, then cut";
  }
  if (role === "lining") return "Lining - cut on lining fabric (not main shell fold)";
  if (role === "fusing") return "Fusing/finish - cut on fusing separately";
  if (role === "contrast") return "Contrast - cut on contrast fabric";
  return "Cut on assigned fabric";
}

function rowForPiece(
  piece: TudPiece,
  size: string,
  doubleFold: boolean
): CutterPiecePlanRow | null {
  const entry = piece.per_size[size];
  if (!entry || !(entry.area_m2 > 0)) return null;
  const role = fabricRole(piece.fabric);
  const { width_cm, height_cm } = rectFromAreaPerimeter(entry.area_m2, entry.perimeter_cm);
  const fabricLabel = tudFabricLabel(piece.fabric);
  return {
    name: piece.name,
    code: piece.code ?? null,
    cut_quantity: Math.max(1, piece.cut_quantity ?? 1),
    fabric: piece.fabric,
    // Many TUDs omit -M; treat missing as shell for cutter copy.
    fabric_label: fabricLabel === "-" && role === "shell" ? "Shell" : fabricLabel,
    fabric_role: role,
    area_m2: entry.area_m2,
    perimeter_cm: entry.perimeter_cm,
    approx_width_cm: width_cm,
    approx_height_cm: height_cm,
    place_hint: placeHint(role, doubleFold),
  };
}

/**
 * Build a cutter-facing parts plan from parsed TUD header metadata.
 * Uses piece names, cut qty, fabric, and approx sizes from area+perimeter.
 */
export function buildCutterPlanFromTud(
  tud: TudMetadata,
  options: { size?: string | null; double_fold?: boolean } = {}
): CutterTudPlan | null {
  const size = resolveNestSize(tud, options.size);
  if (!size) return null;

  const doubleFold = options.double_fold !== false;
  const rows: CutterPiecePlanRow[] = [];
  for (const piece of tud.pieces) {
    const row = rowForPiece(piece, size, doubleFold);
    if (row) rows.push(row);
  }
  if (rows.length === 0) return null;

  // Largest shell first, then others - matches how cutters think about main parts.
  const sorted = sortCutterRows(rows);
  const shell_pieces = sorted.filter((r) => r.fabric_role === "shell");
  const other_pieces = sorted.filter((r) => r.fabric_role !== "shell");
  const total_cut_pieces = sorted.reduce((sum, r) => sum + r.cut_quantity, 0);

  return {
    size,
    style_caption: tud.style_caption,
    total_cut_pieces,
    shell_pieces,
    other_pieces,
    instruction: doubleFold
      ? "Fold shell fabric, place printed shell parts on the fold, cut. Cut lining/fusing on their fabrics."
      : "Place printed parts on open fabric width, then cut. Cut lining/fusing on their fabrics.",
    disclaimer:
      "ESTIMATE ONLY - sizes from TUD header area + perimeter. Not CAD outlines (TUD binary geometry is not parsed).",
  };
}

/** Flat list for tables / PDF (shell first). */
export function flattenCutterPlan(plan: CutterTudPlan): CutterPiecePlanRow[] {
  return [...plan.shell_pieces, ...plan.other_pieces];
}

function sortCutterRows(rows: CutterPiecePlanRow[]): CutterPiecePlanRow[] {
  return [...rows].sort((a, b) => {
    const roleRank = (r: CutterFabricRole) => (r === "shell" ? 0 : 1);
    return (
      roleRank(a.fabric_role) - roleRank(b.fabric_role) ||
      b.area_m2 * b.cut_quantity - a.area_m2 * a.cut_quantity ||
      a.name.localeCompare(b.name)
    );
  });
}

/**
 * Cutter parts plan for a pattern. Multi-piece shells build one plan per
 * garment slot (each TUD keeps its own size) so Overshirt BACK and Trouser BACK
 * are not merged into a doubled qty under a single preferred size.
 */
export function buildCutterPlanForClientPattern(
  pattern: ClientPattern,
  options: { size?: string | null; double_fold?: boolean } = {}
): CutterTudPlan | null {
  const pieceNames = getGarmentPieces(pattern.garment_type)
    .map((n) => n.trim())
    .filter(Boolean);

  if (pieceNames.length <= 1) {
    const piece = pieceNames[0];
    const att = piece ? findActiveTudAttachmentForPiece(pattern, piece) : null;
    const tud = att?.tud ?? findActiveTudAttachment(pattern)?.tud ?? null;
    if (!tud) return null;
    return buildCutterPlanFromTud(tud, options);
  }

  const rows: CutterPiecePlanRow[] = [];
  const sizeLabels: string[] = [];
  let styleCaption: string | null = null;

  for (const pieceName of pieceNames) {
    const att = findActiveTudAttachmentForPiece(pattern, pieceName);
    if (!att?.tud) continue;
    const plan = buildCutterPlanFromTud(att.tud, options);
    if (!plan) continue;
    if (!styleCaption) styleCaption = plan.style_caption;
    if (!sizeLabels.includes(plan.size)) sizeLabels.push(plan.size);
    for (const row of flattenCutterPlan(plan)) {
      rows.push({ ...row, name: `${pieceName}: ${row.name}` });
    }
  }

  if (rows.length === 0) return null;

  const sorted = sortCutterRows(rows);
  const shell_pieces = sorted.filter((r) => r.fabric_role === "shell");
  const other_pieces = sorted.filter((r) => r.fabric_role !== "shell");
  const total_cut_pieces = sorted.reduce((sum, r) => sum + r.cut_quantity, 0);
  const doubleFold = options.double_fold !== false;

  return {
    size: sizeLabels.length === 1 ? sizeLabels[0]! : sizeLabels.join(" / "),
    style_caption: styleCaption,
    total_cut_pieces,
    shell_pieces,
    other_pieces,
    instruction: doubleFold
      ? "Fold shell fabric, place printed shell parts on the fold, cut. Cut lining/fusing on their fabrics."
      : "Place printed parts on open fabric width, then cut. Cut lining/fusing on their fabrics.",
    disclaimer:
      "ESTIMATE ONLY - sizes from TUD header area + perimeter. Not CAD outlines (TUD binary geometry is not parsed).",
  };
}
