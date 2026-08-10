/**
 * Copy filled measurement sizes from one client sheet onto other same-client +
 * same-garment consolidations (e.g. Khaled OT SUMMERTIME -> other OT fabric groups).
 * Set garments can scope to one piece (Overshirt / Trouser / ...) or all pieces.
 */

import { normalizePatternSheetGarment } from "@/lib/pattern-library/base-pattern-picker";
import {
  filterTrialSheetPointsForPiece,
  garmentIsMeasurementSet,
  measurementPieceTokensForGarment,
} from "@/lib/pattern-library/measurement-template-mode";
import { countFilledMeasurements } from "@/lib/pattern-library/protect-pattern-library-write";
import type {
  ClientPattern,
  ClientPatternMeasurement,
  ClientPatternVersion,
  MeasurementPointDef,
  MeasurementUnit,
} from "@/lib/types/pattern-library";

export type CopyMeasurementsMode = "overwrite" | "fill_empty_only";

/** "all" = whole sheet; otherwise a piece token from measurementPieceTokensForGarment. */
export type CopyMeasurementsPieceScope = "all" | string;

export type CopyMeasurementSibling = {
  id: string;
  pattern_ref: string;
  garment_type: string;
  fabric: string | null;
  notes: string | null;
  unit: MeasurementUnit;
  linked_fabric_count: number;
  filled_measurement_count: number;
  is_empty: boolean;
  /** True when the target garment differs and only shared pieces will copy. */
  is_cross_garment: boolean;
  /** Pieces both garments have (e.g. OT -> Overshirt: ["Overshirt"]). */
  shared_pieces: string[];
};

export type CopyMeasurementsApplyOptions = {
  pieceScope?: CopyMeasurementsPieceScope | null;
  dictionary?: Array<Pick<MeasurementPointDef, "id" | "garment_types"> & { name?: string }>;
};

function now(): string {
  return new Date().toISOString();
}

function garmentKey(value: string | null | undefined): string {
  return (normalizePatternSheetGarment(value ?? "") || String(value ?? ""))
    .trim()
    .toLowerCase();
}

export function activeMeasurementVersion(
  pattern: ClientPattern
): ClientPatternVersion | null {
  if (pattern.final_version_id) {
    const final = pattern.versions.find((version) => version.id === pattern.final_version_id);
    if (final) return final;
  }
  return pattern.versions[pattern.versions.length - 1] ?? null;
}

/** Piece tokens Pattern can pick when copying (empty when single-piece garment). */
export function copyMeasurementPieceOptions(garmentType: string): string[] {
  if (!garmentIsMeasurementSet(garmentType)) return [];
  return measurementPieceTokensForGarment(garmentType);
}

export function normalizeCopyMeasurementsPieceScope(
  garmentType: string,
  raw: unknown
): CopyMeasurementsPieceScope {
  const pieces = copyMeasurementPieceOptions(garmentType);
  if (pieces.length === 0) return "all";
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value || value.toLowerCase() === "all" || value.toLowerCase() === "both") {
    return "all";
  }
  const match = pieces.find((piece) => piece.toLowerCase() === value.toLowerCase());
  return match ?? "all";
}

/**
 * Pieces both garments have in common, in the source garment's order.
 * OT source -> Overshirt target: ["Overshirt"]. Same garment: all pieces.
 */
export function sharedCopyPieces(
  sourceGarment: string | null | undefined,
  targetGarment: string | null | undefined
): string[] {
  const sourcePieces = measurementPieceTokensForGarment(sourceGarment ?? "");
  const targetSet = new Set(
    measurementPieceTokensForGarment(targetGarment ?? "").map((piece) =>
      piece.trim().toLowerCase()
    )
  );
  return sourcePieces.filter((piece) => targetSet.has(piece.trim().toLowerCase()));
}

export function listCopyMeasurementSiblings(
  patterns: ClientPattern[],
  source: ClientPattern
): CopyMeasurementSibling[] {
  const clientId = source.client_id;
  const garment = garmentKey(source.garment_type);
  if (!clientId || !garment) return [];

  const out: CopyMeasurementSibling[] = [];
  for (const pattern of patterns) {
    if (pattern.id === source.id) continue;
    if (pattern.client_id !== clientId) continue;
    const sameGarment = garmentKey(pattern.garment_type) === garment;
    const shared = sameGarment
      ? measurementPieceTokensForGarment(source.garment_type)
      : sharedCopyPieces(source.garment_type, pattern.garment_type);
    // Cross-garment targets qualify when the garments share a piece
    // (e.g. Overshirt+Trouser -> Overshirt, or -> Shirt+Trouser via Trouser).
    if (!sameGarment && shared.length === 0) continue;
    const version = activeMeasurementVersion(pattern);
    const filled = countFilledMeasurements(version?.measurements ?? []);
    out.push({
      id: pattern.id,
      pattern_ref: pattern.pattern_ref,
      garment_type: pattern.garment_type,
      fabric: pattern.fabric ?? null,
      notes: pattern.notes ?? null,
      unit: pattern.unit,
      linked_fabric_count: pattern.linked_fabric_line_ids?.length ?? 0,
      filled_measurement_count: filled,
      is_empty: filled === 0,
      is_cross_garment: !sameGarment,
      shared_pieces: shared,
    });
  }
  return out.sort((a, b) => {
    // Same-garment sheets first, then cross-garment piece matches.
    if (a.is_cross_garment !== b.is_cross_garment) return a.is_cross_garment ? 1 : -1;
    return a.pattern_ref.localeCompare(b.pattern_ref);
  });
}

function cloneMeasurement(row: ClientPatternMeasurement): ClientPatternMeasurement {
  return {
    ...structuredClone(row),
    name: row.name?.trim() || row.point_id,
  };
}

function cloneMeasurements(
  rows: ClientPatternMeasurement[]
): ClientPatternMeasurement[] {
  return rows.map((row) => cloneMeasurement(row));
}

function rowIsFilled(row: ClientPatternMeasurement): boolean {
  return (
    row.target_value != null ||
    row.base_value != null ||
    row.sewn_value != null ||
    row.adjustment != null
  );
}

function mergePieceMeasurements(
  targetRows: ClientPatternMeasurement[],
  sourcePieceRows: ClientPatternMeasurement[],
  mode: CopyMeasurementsMode
): ClientPatternMeasurement[] {
  const next = cloneMeasurements(targetRows);
  const byId = new Map(next.map((row, index) => [row.point_id, index]));

  for (const sourceRow of sourcePieceRows) {
    // An empty source row must never blank a filled target value (lost
    // Khaled OT 1/2 Waist this way). Empty rows only add missing points.
    if (!rowIsFilled(sourceRow)) {
      if (!byId.has(sourceRow.point_id)) {
        next.push(cloneMeasurement(sourceRow));
        byId.set(sourceRow.point_id, next.length - 1);
      }
      continue;
    }
    const index = byId.get(sourceRow.point_id);
    if (index == null) {
      next.push(cloneMeasurement(sourceRow));
      byId.set(sourceRow.point_id, next.length - 1);
      continue;
    }
    const existing = next[index]!;
    if (mode === "fill_empty_only" && rowIsFilled(existing)) continue;
    next[index] = {
      ...existing,
      ...cloneMeasurement(sourceRow),
      // Keep target remark/notes fields that are sheet-local if source blank.
      remark: sourceRow.remark ?? existing.remark,
      remarks: sourceRow.remarks ?? existing.remarks,
    };
  }
  return next;
}

/**
 * Detect whether a computed copy result drops filled measurement values the
 * target had before. Copy only adds or replaces values, so any per-point loss
 * of a filled cell is a bug; callers must skip the write when this returns
 * a loss. Checked per point id (not just counts) so a swap cannot hide a wipe.
 */
export function copyWouldLoseFilledValues(
  before: ClientPattern,
  after: ClientPattern
): { versionId: string; lost: number } | null {
  const afterById = new Map(after.versions.map((version) => [version.id, version]));
  for (const beforeVersion of before.versions) {
    const afterVersion = afterById.get(beforeVersion.id);
    if (!afterVersion) return { versionId: beforeVersion.id, lost: 999 };
    const afterRows = new Map(
      (afterVersion.measurements ?? []).map((row) => [row.point_id, row])
    );
    let lost = 0;
    for (const row of beforeVersion.measurements ?? []) {
      if (!rowIsFilled(row)) continue;
      const afterRow = afterRows.get(row.point_id);
      if (!afterRow || !rowIsFilled(afterRow)) lost += 1;
    }
    if (lost > 0) return { versionId: beforeVersion.id, lost };
  }
  return null;
}

/**
 * Apply source active-trial measurements onto target active trial.
 * Copies unit with the numbers so CM stays CM.
 * pieceScope "all" replaces the whole sheet; a piece name merges only that piece.
 */
export function applyCopyMeasurementsToPattern(
  target: ClientPattern,
  source: ClientPattern,
  mode: CopyMeasurementsMode,
  options: CopyMeasurementsApplyOptions = {}
): ClientPattern | null {
  const sourceVersion = activeMeasurementVersion(source);
  const targetVersion = activeMeasurementVersion(target);
  if (!sourceVersion || !targetVersion) return null;

  const sourceMeasurements = sourceVersion.measurements ?? [];
  if (countFilledMeasurements(sourceMeasurements) === 0) return null;

  const pieceScope = normalizeCopyMeasurementsPieceScope(
    source.garment_type,
    options.pieceScope ?? "all"
  );
  const dictionary = options.dictionary ?? [];

  const sameGarment = garmentKey(target.garment_type) === garmentKey(source.garment_type);
  // Cross-garment target (e.g. OT -> Overshirt): only the shared pieces copy,
  // further narrowed by the chosen scope. No shared piece in scope = skip.
  let crossPieces: string[] | null = null;
  if (!sameGarment) {
    let shared = sharedCopyPieces(source.garment_type, target.garment_type);
    if (pieceScope !== "all") {
      shared = shared.filter(
        (piece) => piece.trim().toLowerCase() === pieceScope.trim().toLowerCase()
      );
    }
    if (shared.length === 0) return null;
    crossPieces = shared;
  }

  let nextMeasurements: ClientPatternMeasurement[];
  if (crossPieces) {
    const sourcePieces = measurementPieceTokensForGarment(source.garment_type);
    // Single-piece source (e.g. Overshirt sheet): every row belongs to that
    // piece, so piece-filtering would only lose mislabeled rows.
    const sourcePieceRows =
      sourcePieces.length <= 1
        ? sourceMeasurements
        : crossPieces.flatMap((piece) =>
            filterTrialSheetPointsForPiece(sourceMeasurements, piece, dictionary)
          );
    if (countFilledMeasurements(sourcePieceRows) === 0) return null;
    nextMeasurements = mergePieceMeasurements(
      targetVersion.measurements ?? [],
      sourcePieceRows,
      mode
    );
  } else if (pieceScope === "all") {
    if (mode === "fill_empty_only") {
      const targetFilled = countFilledMeasurements(targetVersion.measurements ?? []);
      if (targetFilled > 0) return null;
    }
    // Merge instead of wholesale replace: a point the source never filled
    // must keep the target's existing value instead of going blank.
    nextMeasurements = mergePieceMeasurements(
      targetVersion.measurements ?? [],
      sourceMeasurements,
      mode
    );
  } else {
    const sourcePieceRows = filterTrialSheetPointsForPiece(
      sourceMeasurements,
      pieceScope,
      dictionary
    );
    if (countFilledMeasurements(sourcePieceRows) === 0) return null;
    nextMeasurements = mergePieceMeasurements(
      targetVersion.measurements ?? [],
      sourcePieceRows,
      mode
    );
  }

  const copyInstructions = pieceScope === "all" && sameGarment;
  const nextVersion: ClientPatternVersion = {
    ...targetVersion,
    measurements: nextMeasurements,
    special_instructions: copyInstructions
      ? sourceVersion.special_instructions ?? targetVersion.special_instructions ?? null
      : targetVersion.special_instructions,
    notes: targetVersion.notes,
    updated_at: now(),
  };

  return {
    ...target,
    unit: source.unit,
    special_instructions: copyInstructions
      ? sourceVersion.special_instructions ?? target.special_instructions ?? null
      : target.special_instructions,
    versions: target.versions.map((candidate) =>
      candidate.id === targetVersion.id ? nextVersion : candidate
    ),
    updated_at: now(),
  };
}
