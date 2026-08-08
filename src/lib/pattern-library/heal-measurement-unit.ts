/**
 * Historical client sheets often store inch numbers (1/16" snaps) while the
 * `unit` field says "cm" (imports / empty-sheet heal without copying unit).
 * Relabel those to "in" without converting the numbers so cm display converts
 * correctly. Sheets that were accidentally converted to cm (toggle aligned
 * storage) are converted back to inches.
 */

import {
  readPatternLibraryFresh,
  writePatternLibrary,
} from "@/lib/data/pattern-library";
import {
  convertMeasurementRowUnit,
  convertMeasurementUnit,
} from "@/lib/pattern-library/measurements";
import type { ClientPattern, ClientPatternMeasurement } from "@/lib/types/pattern-library";

function now(): string {
  return new Date().toISOString();
}

function collectNumericValues(measurements: ClientPatternMeasurement[]): number[] {
  const out: number[] = [];
  for (const row of measurements) {
    for (const key of ["base_value", "target_value", "sewn_value"] as const) {
      const value = row[key];
      if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
        out.push(Math.abs(value));
      }
    }
  }
  return out;
}

/**
 * True when filled cells look like Pattern inch sheets (1/16" precision,
 * garment-inch magnitude) rather than centimeter sheets.
 */
export function looksLikeStoredInchMeasurements(pattern: ClientPattern): boolean {
  const values: number[] = [];
  for (const version of pattern.versions ?? []) {
    values.push(...collectNumericValues(version.measurements ?? []));
  }
  if (values.length < 3) return false;
  const sixteenthCount = values.filter(
    (value) => Math.abs(value * 16 - Math.round(value * 16)) < 1e-6
  ).length;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  return sixteenthCount / values.length >= 0.4 && median >= 8 && median <= 50;
}

/** Relabel cm -> in when numbers are already inches. Does not convert values. */
export function applyInchUnitRelabel(pattern: ClientPattern): ClientPattern | null {
  if (pattern.unit !== "cm") return null;
  if (!looksLikeStoredInchMeasurements(pattern)) return null;
  return {
    ...pattern,
    unit: "in",
    updated_at: now(),
  };
}

/**
 * True when cm-labeled values look like they were converted from an inch sheet
 * by our converter (2-decimal cm) and round-trip back to inches on 1/16".
 * Integer-heavy cm sheets (true centimeter imports) are left alone.
 */
export function looksLikeConvertedCmFromInches(pattern: ClientPattern): boolean {
  if (pattern.unit !== "cm") return false;
  const values: number[] = [];
  for (const version of pattern.versions ?? []) {
    values.push(...collectNumericValues(version.measurements ?? []));
  }
  if (values.length < 3) return false;
  const twoDecimalCount = values.filter((value) => {
    const cents = Math.round(value * 100);
    return Math.abs(value * 100 - cents) < 1e-6 && cents % 100 !== 0;
  }).length;
  if (twoDecimalCount / values.length < 0.5) return false;
  const asInches = values.map((value) => convertMeasurementUnit(value, "cm", "in"));
  const sixteenthCount = asInches.filter(
    (value) => Math.abs(value * 16 - Math.round(value * 16)) < 1e-6
  ).length;
  const sorted = [...asInches].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  return sixteenthCount / values.length >= 0.5 && median >= 8 && median <= 50;
}

/** Convert cm cells back to inches and set unit=in (for accidental cm converts). */
export function applyConvertedCmBackToInches(pattern: ClientPattern): ClientPattern | null {
  if (!looksLikeConvertedCmFromInches(pattern)) return null;
  return {
    ...pattern,
    unit: "in",
    versions: pattern.versions.map((version) => ({
      ...version,
      measurements: version.measurements.map((row) =>
        convertMeasurementRowUnit(row, "cm", "in")
      ),
      updated_at: now(),
    })),
    updated_at: now(),
  };
}

/** Prefer relabel (numbers already inches); else restore accidental cm converts. */
export function applyRestoreStoredInches(pattern: ClientPattern): ClientPattern | null {
  return applyInchUnitRelabel(pattern) ?? applyConvertedCmBackToInches(pattern);
}

export async function healMislabeledInchClientPatternUnit(
  patternId: string
): Promise<
  | { ok: true; pattern: ClientPattern; changed: boolean }
  | { ok: false; pattern: null; changed: false }
> {
  const store = await readPatternLibraryFresh();
  const index = store.client_patterns.findIndex((pattern) => pattern.id === patternId);
  if (index < 0) return { ok: false, pattern: null, changed: false };

  const existing = store.client_patterns[index]!;
  const next = applyRestoreStoredInches(existing);
  if (!next) return { ok: true, pattern: existing, changed: false };

  store.client_patterns[index] = next;
  await writePatternLibrary(store);
  return { ok: true, pattern: next, changed: true };
}

/** One-shot / ops: restore every filled sheet that should be stored inches. */
export async function healAllMislabeledInchClientPatternUnits(): Promise<{
  changed_ids: string[];
  scanned: number;
}> {
  const store = await readPatternLibraryFresh();
  const changedIds: string[] = [];
  let scanned = 0;

  store.client_patterns = store.client_patterns.map((pattern) => {
    scanned += 1;
    const next = applyRestoreStoredInches(pattern);
    if (!next) return pattern;
    changedIds.push(pattern.id);
    return next;
  });

  if (changedIds.length > 0) {
    store.updated_at = now();
    await writePatternLibrary(store);
  }

  return { changed_ids: changedIds, scanned };
}
