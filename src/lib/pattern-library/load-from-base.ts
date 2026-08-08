import { convertMeasurementUnit } from "@/lib/pattern-library/measurements";
import type { TrialSheetPoint } from "@/lib/pattern-library/trial-sheet";
import type {
  BasePattern,
  BasePatternClientColumn,
  BasePatternPoint,
  MeasurementPointDef,
  MeasurementUnit,
} from "@/lib/types/pattern-library";

/**
 * "Load from base pattern" on the client measurement sheet: copy one column of
 * a library base grid (a size column, or the client's fit column) into the
 * sheet's Sample cells. Pure helpers (no I/O) so unit conversion and point
 * name matching are unit-testable.
 *
 * Conventions decided with the pattern team:
 *   - Units convert between the base grid and the sheet (cm <-> in). Inch
 *     results snap to 1/16" (sheet precision); cm results keep 2 decimals.
 *   - Points match by id, then normalized name, then dictionary aliases, then
 *     a unique-containment pass ("1/2 Waist" -> "1/2 Waist straight Relux").
 *     Ambiguous or unmatched rows are left empty and reported.
 */

/** Converts a grid value between units, rounding to the sheet's precision. */
export function convertUnitValue(
  value: number,
  fromUnit: MeasurementUnit,
  toUnit: MeasurementUnit
): number {
  return convertMeasurementUnit(value, fromUnit, toUnit);
}

/** Case/spacing/punctuation-insensitive key: "1/2 Waist  (relax)" -> "1 2 waist relax". */
export function normalizePointKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Base value at a size, with the trim-point fallback used across the module. */
export function basePointValueAtSize(point: BasePatternPoint, size: string): number | null {
  const fallback = point.is_graded
    ? null
    : Object.values(point.values).find((value) => value !== null) ?? null;
  return point.values[size] ?? fallback;
}

/** Column of the base grid to copy: a size run column or a client fit column. */
export type BaseGridColumn =
  | { kind: "size"; size: string }
  | { kind: "client"; column: BasePatternClientColumn };

/**
 * Value of a base point in the chosen column. Client fit columns fall back to
 * their anchor size when the client cell was not entered (documented
 * semantics of BasePatternClientColumn.values).
 */
export function baseColumnValue(point: BasePatternPoint, column: BaseGridColumn): number | null {
  if (column.kind === "size") return basePointValueAtSize(point, column.size);
  const clientValue = column.column.values[point.point_id];
  if (clientValue !== null && clientValue !== undefined) return clientValue;
  return basePointValueAtSize(point, column.column.base_size);
}

/** All normalized keys for a name: itself plus dictionary canonical name + aliases. */
function keysForName(
  name: string,
  pointId: string | null,
  dictionary: MeasurementPointDef[]
): Set<string> {
  const keys = new Set<string>();
  const primary = normalizePointKey(name);
  if (primary) keys.add(primary);
  for (const def of dictionary) {
    const defKeys = [def.name, ...def.aliases].map(normalizePointKey);
    const matchesDef =
      (pointId !== null && def.id === pointId) || defKeys.includes(primary);
    if (!matchesDef) continue;
    for (const key of defKeys) if (key) keys.add(key);
  }
  return keys;
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  for (const key of a) if (b.has(key)) return true;
  return false;
}

/** True when the shorter token list appears as a contiguous run in the longer one. */
function tokensContain(a: string[], b: string[]): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length === 0 || short.length === long.length) return false;
  for (let start = 0; start + short.length <= long.length; start += 1) {
    let all = true;
    for (let i = 0; i < short.length; i += 1) {
      if (long[start + i] !== short[i]) {
        all = false;
        break;
      }
    }
    if (all) return true;
  }
  return false;
}

/**
 * Matches sheet rows to base points. Passes, strongest first; each base point
 * is claimed at most once:
 *   1. point_id equality
 *   2. normalized-name / dictionary-alias intersection
 *   3. containment: row and point names share a contiguous token run
 *      ("1/2 Waist" in "1/2 Waist straight Relux") - only when exactly one
 *      unclaimed candidate matches, otherwise the row stays unmatched.
 */
export function matchSheetPointsToBase(
  rows: TrialSheetPoint[],
  basePoints: BasePatternPoint[],
  dictionary: MeasurementPointDef[]
): Map<string, BasePatternPoint> {
  const matched = new Map<string, BasePatternPoint>();
  const claimed = new Set<string>();

  const byId = new Map(basePoints.map((point) => [point.point_id, point]));
  for (const row of rows) {
    const point = byId.get(row.point_id);
    if (point && !claimed.has(point.point_id)) {
      matched.set(row.point_id, point);
      claimed.add(point.point_id);
    }
  }

  const baseKeySets = basePoints.map((point) => ({
    point,
    keys: keysForName(point.name, point.point_id, dictionary),
  }));

  for (const row of rows) {
    if (matched.has(row.point_id)) continue;
    const rowKeys = keysForName(row.name, row.point_id, dictionary);
    const hit = baseKeySets.find(
      (entry) => !claimed.has(entry.point.point_id) && intersects(rowKeys, entry.keys)
    );
    if (hit) {
      matched.set(row.point_id, hit.point);
      claimed.add(hit.point.point_id);
    }
  }

  for (const row of rows) {
    if (matched.has(row.point_id)) continue;
    const rowTokens = normalizePointKey(row.name).split(" ").filter(Boolean);
    if (rowTokens.length === 0) continue;
    const candidates = baseKeySets.filter((entry) => {
      if (claimed.has(entry.point.point_id)) return false;
      const pointTokens = normalizePointKey(entry.point.name).split(" ").filter(Boolean);
      return tokensContain(rowTokens, pointTokens);
    });
    if (candidates.length !== 1) continue;
    matched.set(row.point_id, candidates[0]!.point);
    claimed.add(candidates[0]!.point.point_id);
  }

  return matched;
}

export interface SampleFillResult {
  /** sheet point_id -> value in the sheet's unit, ready for the Sample cells. */
  values: Record<string, number>;
  /** Sheet point names that received a value. */
  filled: string[];
  /** Sheet point names with no confident match or no value in the chosen column. */
  unmatched: string[];
  /** True when values were converted between cm and inches. */
  converted: boolean;
}

/**
 * Builds the Sample-column fill for a sheet from one base grid column,
 * converting units when the base and the sheet disagree.
 */
export function buildSampleFillFromBase(input: {
  rows: TrialSheetPoint[];
  base: Pick<BasePattern, "points" | "unit">;
  column: BaseGridColumn;
  sheetUnit: MeasurementUnit;
  dictionary: MeasurementPointDef[];
}): SampleFillResult {
  const matches = matchSheetPointsToBase(input.rows, input.base.points, input.dictionary);
  const converted = input.base.unit !== input.sheetUnit;
  const values: Record<string, number> = {};
  const filled: string[] = [];
  const unmatched: string[] = [];

  for (const row of input.rows) {
    const point = matches.get(row.point_id) ?? null;
    const raw = point ? baseColumnValue(point, input.column) : null;
    if (raw === null) {
      unmatched.push(row.name);
      continue;
    }
    values[row.point_id] = convertUnitValue(raw, input.base.unit, input.sheetUnit);
    filled.push(row.name);
  }

  return { values, filled, unmatched, converted };
}

/** "14 of 16 points filled; unmatched: X, Y" - ASCII, for notices and previews. */
export function summarizeSampleFill(result: SampleFillResult, totalRows: number): string {
  const parts = [`${result.filled.length} of ${totalRows} points filled`];
  if (result.unmatched.length > 0) {
    parts.push(`unmatched: ${result.unmatched.join(", ")}`);
  }
  return parts.join("; ");
}
