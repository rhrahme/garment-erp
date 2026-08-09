import { convertMeasurementUnit } from "@/lib/pattern-library/measurements";
import type {
  BasePattern,
  BasePatternPoint,
  ClientPattern,
  ClientPatternMeasurement,
  MeasurementUnit,
  PatternLibraryAttachment,
} from "@/lib/types/pattern-library";

/**
 * .TUD size → measurement sheet pre-fill. Pure helpers (no I/O) so the size
 * normalization and fill rules are unit-testable:
 *   - "2XL" ≡ "XXL" ≡ "xxl" ≡ "2-XL" (numeric X-prefix vs repeated-X, case/dash tolerant)
 *   - prefixed sizes (R-40, L-52…) keep their prefix — R-40 never matches 40 or L-40
 *   - filling only writes base/target cells that are currently empty
 */

/**
 * Canonical form for size comparison: uppercase, spaces/dashes/underscores
 * removed, repeated-X alpha sizes rewritten to the numeric form (XXL → 2XL,
 * XXXS → 3XS). XL/XS (single X) stay as-is.
 */
export function normalizeSizeToken(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/[\s_-]+/g, "");
  const repeated = cleaned.match(/^(X{2,})([LS])$/);
  if (repeated) return `${repeated[1]!.length}X${repeated[2]}`;
  return cleaned;
}

export function sizesMatch(a: string, b: string): boolean {
  const left = normalizeSizeToken(a);
  const right = normalizeSizeToken(b);
  return left.length > 0 && left === right;
}

/** First base size column equivalent to the detected size, or null. */
export function findBaseSizeMatch(detectedSize: string, baseSizes: string[]): string | null {
  return baseSizes.find((candidate) => sizesMatch(detectedSize, candidate)) ?? null;
}

export interface TudSizeMatch {
  /** Size as written in the .tud file (e.g. "2XL"). */
  size: string;
  /** Equivalent size column on the base pattern (e.g. "XXL"). */
  base_size: string;
}

/** Detected .tud sizes that resolve to a column on the base (order preserved, deduped). */
export function matchTudSizesToBase(tudSizes: string[], baseSizes: string[]): TudSizeMatch[] {
  const matches: TudSizeMatch[] = [];
  const seen = new Set<string>();
  for (const size of tudSizes) {
    const baseSize = findBaseSizeMatch(size, baseSizes);
    if (!baseSize || seen.has(baseSize)) continue;
    seen.add(baseSize);
    matches.push({ size, base_size: baseSize });
  }
  return matches;
}

function pointNameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Base value at a size, with the trim-point fallback used across the module. */
function basePointValue(point: BasePatternPoint, size: string): number | null {
  // Trim points are constant across sizes — take the first documented value
  // when the exact size cell is empty (same rule as pattern creation).
  const fallback = point.is_graded
    ? null
    : Object.values(point.values).find((value) => value !== null) ?? null;
  return point.values[size] ?? fallback;
}

export interface TudFillOutcome {
  measurements: ClientPatternMeasurement[];
  /** Existing rows whose empty base/target cells were populated. */
  filled_points: number;
  /** Base points that were missing from the sheet and appended. */
  added_points: number;
}

/**
 * Fills empty base/target cells of an existing measurement sheet from the base
 * pattern's values at `size`, and appends base points not on the sheet yet.
 * Never overwrites an entered value; sewn/adjustment/remarks are untouched.
 * When `sheetUnit` differs from `base.unit`, values are converted before write
 * so inch bases never stamp raw numbers onto a cm sheet (or the reverse).
 */
export function fillMeasurementsFromBase(
  rows: ClientPatternMeasurement[],
  base: Pick<BasePattern, "points"> & { unit?: MeasurementUnit },
  size: string,
  options?: { sheetUnit?: MeasurementUnit | null }
): TudFillOutcome {
  const byId = new Map(base.points.map((point) => [point.point_id, point]));
  const byName = new Map(base.points.map((point) => [pointNameKey(point.name), point]));
  const baseUnit = base.unit;
  const sheetUnit = options?.sheetUnit ?? null;
  const toSheet = (value: number): number => {
    if (!baseUnit || !sheetUnit || baseUnit === sheetUnit) return value;
    return convertMeasurementUnit(value, baseUnit, sheetUnit);
  };

  const matchedPointIds = new Set<string>();
  let filled = 0;
  const measurements = rows.map((row) => {
    const point = byId.get(row.point_id) ?? byName.get(pointNameKey(row.name)) ?? null;
    if (!point) return row;
    matchedPointIds.add(point.point_id);
    const raw = basePointValue(point, size);
    if (raw === null) return row;
    const value = toSheet(raw);
    const nextBase = row.base_value === null ? value : row.base_value;
    const nextTarget = row.target_value === null ? value : row.target_value;
    if (nextBase === row.base_value && nextTarget === row.target_value) return row;
    filled += 1;
    return { ...row, base_value: nextBase, target_value: nextTarget };
  });

  let added = 0;
  for (const point of base.points) {
    if (matchedPointIds.has(point.point_id)) continue;
    const raw = basePointValue(point, size);
    const value = raw === null ? null : toSheet(raw);
    measurements.push({
      point_id: point.point_id,
      name: point.name,
      remark: point.remark,
      is_graded: point.is_graded,
      base_value: value,
      target_value: value,
      sewn_value: null,
      adjustment: null,
      remarks: null,
    });
    added += 1;
  }

  return { measurements, filled_points: filled, added_points: added };
}

export interface TudFillCandidateBase {
  id: string;
  name: string;
  garment_type: string;
  house_brand_code: string;
  /** Detected .tud sizes that exist on this base. */
  matches: TudSizeMatch[];
}

/**
 * Returned with the upload response so the UI can offer "set size + fill
 * sheet" right after a .tud lands on a client pattern.
 */
export interface TudFillSuggestion {
  attachment_id: string;
  filename: string;
  style_caption: string | null;
  /** All sizes found in the .tud (-S records). */
  sizes: string[];
  /** Trial the fill would apply to (upload target, else latest trial). */
  version_id: string | null;
  /** The pattern's linked base, when it has one and at least one size matches. */
  base: TudFillCandidateBase | null;
  /** Same-garment bases with a matching size — offered when no base is linked. */
  candidate_bases: TudFillCandidateBase[];
  /** Preview counts for the linked base (first match): cells that would fill / rows that would append. */
  fillable_points: number | null;
  addable_points: number | null;
}

function candidateFor(base: BasePattern, tudSizes: string[]): TudFillCandidateBase | null {
  const matches = matchTudSizesToBase(tudSizes, base.sizes);
  if (matches.length === 0) return null;
  return {
    id: base.id,
    name: base.name,
    garment_type: base.garment_type,
    house_brand_code: base.house_brand_code,
    matches,
  };
}

/**
 * Builds the post-upload suggestion, or null when there is nothing actionable
 * (no sizes in the file, no size overlap, or the sheet is already sized+full).
 */
export function buildTudFillSuggestion(input: {
  pattern: ClientPattern;
  basePatterns: BasePattern[];
  attachment: PatternLibraryAttachment;
  versionId?: string | null;
}): TudFillSuggestion | null {
  const tud = input.attachment.tud;
  if (!tud || tud.sizes.length === 0) return null;

  const { pattern } = input;
  const version =
    (input.versionId
      ? pattern.versions.find((candidate) => candidate.id === input.versionId)
      : null) ?? pattern.versions[pattern.versions.length - 1] ?? null;

  const suggestion: TudFillSuggestion = {
    attachment_id: input.attachment.id,
    filename: input.attachment.filename,
    style_caption: tud.style_caption,
    sizes: tud.sizes,
    version_id: version?.id ?? null,
    base: null,
    candidate_bases: [],
    fillable_points: null,
    addable_points: null,
  };

  if (pattern.base_pattern_id) {
    const base = input.basePatterns.find((candidate) => candidate.id === pattern.base_pattern_id);
    if (!base) return null;
    const candidate = candidateFor(base, tud.sizes);
    if (!candidate) return null;
    suggestion.base = candidate;

    // Preview against the current-size match when the pattern is already
    // sized, else the first detected match.
    const preferred =
      (pattern.base_size
        ? candidate.matches.find((match) => sizesMatch(match.base_size, pattern.base_size!))
        : null) ?? candidate.matches[0]!;
    const outcome = fillMeasurementsFromBase(version?.measurements ?? [], base, preferred.base_size, {
      sheetUnit: pattern.unit,
    });
    suggestion.fillable_points = outcome.filled_points;
    suggestion.addable_points = outcome.added_points;

    // Already sized to a detected size and nothing to fill — no prompt.
    const alreadySized =
      pattern.base_size !== null &&
      candidate.matches.some((match) => sizesMatch(match.base_size, pattern.base_size!));
    if (alreadySized && outcome.filled_points === 0 && outcome.added_points === 0) return null;
    return suggestion;
  }

  suggestion.candidate_bases = input.basePatterns
    .filter((base) => base.garment_type === pattern.garment_type)
    .map((base) => candidateFor(base, tud.sizes))
    .filter((candidate): candidate is TudFillCandidateBase => candidate !== null);
  if (suggestion.candidate_bases.length === 0) return null;
  return suggestion;
}
