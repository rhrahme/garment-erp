import type {
  BasePattern,
  BasePatternClientColumn,
} from "@/lib/types/pattern-library";

/**
 * Client fit columns on a base pattern size grid: pure sanitize/merge logic
 * shared by the session API, the /api/v1 Zapier route, and tests.
 * One column per client per base pattern, anchored to a chosen base size.
 */

export interface ClientFitColumnInput {
  client_id: string;
  client_code?: string | null;
  client_name: string;
  base_size: string;
  values?: Record<string, unknown> | null;
}

export type ClientFitColumnError = { ok: false; error: string };
export type ClientFitColumnOk = {
  ok: true;
  columns: BasePatternClientColumn[];
  column: BasePatternClientColumn;
};

/**
 * Keeps only values for measurement points that exist on the base pattern;
 * non-finite entries become null (declared-but-empty cells stay real).
 */
export function sanitizeClientColumnValues(
  raw: Record<string, unknown> | null | undefined,
  base: Pick<BasePattern, "points">
): Record<string, number | null> {
  const values: Record<string, number | null> = {};
  if (!raw || typeof raw !== "object") return values;
  const knownPointIds = new Set(base.points.map((point) => point.point_id));
  for (const [pointId, value] of Object.entries(raw)) {
    if (!knownPointIds.has(pointId)) continue;
    values[pointId] =
      typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return values;
}

/**
 * Validates the input against the base pattern and merges it into the column
 * list. Existing column for the same client is updated in place (values are
 * replaced, not merged - the grid always sends the full column).
 */
export function upsertClientFitColumn(
  base: Pick<BasePattern, "sizes" | "points" | "client_columns">,
  input: ClientFitColumnInput,
  options: { actor?: string | null; timestamp?: string } = {}
): ClientFitColumnOk | ClientFitColumnError {
  const clientId = input.client_id?.trim();
  const clientName = input.client_name?.trim();
  const baseSize = input.base_size?.trim();
  if (!clientId || !clientName) {
    return { ok: false, error: "client_id and client_name are required." };
  }
  if (!baseSize) {
    return { ok: false, error: "base_size is required." };
  }
  if (!base.sizes.includes(baseSize)) {
    return {
      ok: false,
      error: `base_size ${baseSize} is not on this pattern (${base.sizes.join(", ")}).`,
    };
  }

  const timestamp = options.timestamp ?? new Date().toISOString();
  const actor = options.actor ?? null;
  const columns = base.client_columns ?? [];
  const existing = columns.find((column) => column.client_id === clientId) ?? null;

  const column: BasePatternClientColumn = {
    id: existing?.id ?? `bpcc-${Date.now()}-${columns.length + 1}`,
    client_id: clientId,
    client_code: input.client_code?.toString().trim() || existing?.client_code || null,
    client_name: clientName,
    base_size: baseSize,
    values: sanitizeClientColumnValues(input.values, base),
    created_by: existing?.created_by ?? actor,
    updated_by: actor,
    created_at: existing?.created_at ?? timestamp,
    updated_at: timestamp,
  };

  const next = existing
    ? columns.map((candidate) => (candidate.client_id === clientId ? column : candidate))
    : [...columns, column];
  return { ok: true, columns: next, column };
}

/** Removes a client's fit column; returns null when the client has none. */
export function removeClientFitColumn(
  columns: BasePatternClientColumn[] | undefined,
  clientId: string
): { columns: BasePatternClientColumn[]; removed: BasePatternClientColumn } | null {
  const list = columns ?? [];
  const removed = list.find((column) => column.client_id === clientId.trim()) ?? null;
  if (!removed) return null;
  return {
    columns: list.filter((column) => column.client_id !== removed.client_id),
    removed,
  };
}

/**
 * Grid column order: each client column renders directly after its base size.
 * Columns whose base_size no longer exists render after the last size so the
 * data stays visible instead of silently disappearing.
 */
export function orderedGridColumns(
  sizes: string[],
  columns: BasePatternClientColumn[] | undefined
): Array<
  | { kind: "size"; size: string }
  | { kind: "client"; column: BasePatternClientColumn }
> {
  const list = columns ?? [];
  const result: Array<
    | { kind: "size"; size: string }
    | { kind: "client"; column: BasePatternClientColumn }
  > = [];
  for (const size of sizes) {
    result.push({ kind: "size", size });
    for (const column of list) {
      if (column.base_size === size) result.push({ kind: "client", column });
    }
  }
  for (const column of list) {
    if (!sizes.includes(column.base_size)) result.push({ kind: "client", column });
  }
  return result;
}

/** Delta vs the base size value, rounded to 1/1000 - null when either side is empty. */
export function clientColumnDelta(
  baseValue: number | null | undefined,
  clientValue: number | null | undefined
): number | null {
  if (typeof baseValue !== "number" || typeof clientValue !== "number") return null;
  const delta = Math.round((clientValue - baseValue) * 1000) / 1000;
  return delta === 0 ? null : delta;
}

/** Short display label for the column header, e.g. "Youssef (from XL)". */
export function clientColumnHeaderLabel(column: BasePatternClientColumn): string {
  const firstName = column.client_name.trim().split(/\s+/)[0] || column.client_name;
  return `${firstName} (from ${column.base_size})`;
}
