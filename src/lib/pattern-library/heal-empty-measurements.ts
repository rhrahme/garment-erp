/**
 * When Pattern opens a consolidated / fabric-linked pattern that has an empty
 * measurement sheet, copy filled rows from another same-client + same-garment
 * pattern. Stops the "sheet vanished" confusion when measurements were entered
 * on a duplicate pattern id while fabrics live on the consolidated one.
 */

import {
  readPatternLibraryFresh,
  writePatternLibrary,
} from "@/lib/data/pattern-library";
import { normalizePatternSheetGarment } from "@/lib/pattern-library/base-pattern-picker";
import { countFilledMeasurements } from "@/lib/pattern-library/protect-pattern-library-write";
import type {
  ClientPattern,
  ClientPatternVersion,
} from "@/lib/types/pattern-library";

function now(): string {
  return new Date().toISOString();
}

function garmentKey(value: string | null | undefined): string {
  return (normalizePatternSheetGarment(value ?? "") || String(value ?? ""))
    .trim()
    .toLowerCase();
}

function scoreVersion(version: ClientPatternVersion): number {
  const measurements = version.measurements ?? [];
  const filled = countFilledMeasurements(measurements);
  const remarks = measurements.filter(
    (row) => typeof row.remarks === "string" && row.remarks.trim()
  ).length;
  return filled * 100 + remarks * 10 + measurements.length;
}

function activeVersion(pattern: ClientPattern): ClientPatternVersion | null {
  if (pattern.final_version_id) {
    const final = pattern.versions.find((version) => version.id === pattern.final_version_id);
    if (final) return final;
  }
  return pattern.versions[pattern.versions.length - 1] ?? null;
}

export function findBestSiblingMeasurementSource(
  patterns: ClientPattern[],
  target: ClientPattern
): { pattern: ClientPattern; version: ClientPatternVersion; score: number } | null {
  const clientId = target.client_id;
  const garment = garmentKey(target.garment_type);
  if (!clientId || !garment) return null;

  let best: { pattern: ClientPattern; version: ClientPatternVersion; score: number } | null =
    null;
  for (const pattern of patterns) {
    if (pattern.id === target.id) continue;
    if (pattern.client_id !== clientId) continue;
    if (garmentKey(pattern.garment_type) !== garment) continue;
    for (const version of pattern.versions ?? []) {
      const score = scoreVersion(version);
      if (score < 100) continue; // need at least one filled cell
      if (!best || score > best.score) {
        best = { pattern, version, score };
      }
    }
  }
  return best;
}

/** True when the sheet has no rows, or only blank template rows. */
export function isMeasurementSheetEmpty(pattern: ClientPattern): boolean {
  const version = activeVersion(pattern);
  if (!version) return true;
  const measurements = version.measurements ?? [];
  if (measurements.length === 0) return true;
  return countFilledMeasurements(measurements) === 0;
}

export function applySiblingMeasurementHeal(
  target: ClientPattern,
  sourceVersion: ClientPatternVersion,
  options: { sourceUnit?: ClientPattern["unit"] } = {}
): ClientPattern | null {
  if (!isMeasurementSheetEmpty(target)) return null;
  const version = activeVersion(target);
  if (!version) return null;
  const sourceMeasurements = structuredClone(sourceVersion.measurements ?? []);
  if (sourceMeasurements.length === 0) return null;

  const nextVersion: ClientPatternVersion = {
    ...version,
    measurements: sourceMeasurements,
    special_instructions:
      version.special_instructions ?? sourceVersion.special_instructions ?? null,
    notes: version.notes ?? sourceVersion.notes ?? null,
    updated_at: now(),
  };

  return {
    ...target,
    // Copied inch numbers must keep the source unit (do not leave target as cm).
    unit: options.sourceUnit ?? target.unit,
    versions: target.versions.map((candidate) =>
      candidate.id === version.id ? nextVersion : candidate
    ),
    updated_at: now(),
  };
}

export async function healEmptyClientPatternMeasurements(
  patternId: string
): Promise<
  | { ok: true; pattern: ClientPattern; changed: boolean; source_pattern_id: string | null }
  | { ok: false; pattern: null; changed: false; source_pattern_id: null }
> {
  const store = await readPatternLibraryFresh();
  const index = store.client_patterns.findIndex((pattern) => pattern.id === patternId);
  if (index < 0) {
    return {
      ok: false,
      pattern: null,
      changed: false,
      source_pattern_id: null,
    };
  }
  const existing = store.client_patterns[index]!;
  if (!isMeasurementSheetEmpty(existing)) {
    return { ok: true, pattern: existing, changed: false, source_pattern_id: null };
  }

  const source = findBestSiblingMeasurementSource(store.client_patterns, existing);
  if (!source) {
    return { ok: true, pattern: existing, changed: false, source_pattern_id: null };
  }

  const healed = applySiblingMeasurementHeal(existing, source.version, {
    sourceUnit: source.pattern.unit,
  });
  if (!healed) {
    return { ok: true, pattern: existing, changed: false, source_pattern_id: null };
  }

  store.client_patterns[index] = healed;
  await writePatternLibrary(store);
  return {
    ok: true,
    pattern: healed,
    changed: true,
    source_pattern_id: source.pattern.id,
  };
}
