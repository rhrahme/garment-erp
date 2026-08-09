/**
 * Copy filled measurement sizes from one client sheet onto other same-client +
 * same-garment consolidations (e.g. Khaled OT SUMMERTIME -> other OT fabric groups).
 */

import { normalizePatternSheetGarment } from "@/lib/pattern-library/base-pattern-picker";
import { countFilledMeasurements } from "@/lib/pattern-library/protect-pattern-library-write";
import type {
  ClientPattern,
  ClientPatternMeasurement,
  ClientPatternVersion,
  MeasurementUnit,
} from "@/lib/types/pattern-library";

export type CopyMeasurementsMode = "overwrite" | "fill_empty_only";

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
    if (garmentKey(pattern.garment_type) !== garment) continue;
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
    });
  }
  return out.sort((a, b) => a.pattern_ref.localeCompare(b.pattern_ref));
}

function cloneMeasurements(
  rows: ClientPatternMeasurement[]
): ClientPatternMeasurement[] {
  return structuredClone(rows).map((row) => ({
    ...row,
    name: row.name?.trim() || row.point_id,
  }));
}

/**
 * Apply source active-trial measurements onto target active trial.
 * Copies unit with the numbers so CM stays CM.
 */
export function applyCopyMeasurementsToPattern(
  target: ClientPattern,
  source: ClientPattern,
  mode: CopyMeasurementsMode
): ClientPattern | null {
  const sourceVersion = activeMeasurementVersion(source);
  const targetVersion = activeMeasurementVersion(target);
  if (!sourceVersion || !targetVersion) return null;

  const sourceMeasurements = sourceVersion.measurements ?? [];
  if (countFilledMeasurements(sourceMeasurements) === 0) return null;

  if (mode === "fill_empty_only") {
    const targetFilled = countFilledMeasurements(targetVersion.measurements ?? []);
    if (targetFilled > 0) return null;
  }

  const nextVersion: ClientPatternVersion = {
    ...targetVersion,
    measurements: cloneMeasurements(sourceMeasurements),
    special_instructions:
      sourceVersion.special_instructions ?? targetVersion.special_instructions ?? null,
    notes: targetVersion.notes,
    updated_at: now(),
  };

  return {
    ...target,
    unit: source.unit,
    special_instructions:
      sourceVersion.special_instructions ?? target.special_instructions ?? null,
    versions: target.versions.map((candidate) =>
      candidate.id === targetVersion.id ? nextVersion : candidate
    ),
    updated_at: now(),
  };
}
