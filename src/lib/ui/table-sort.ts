import type { SortDirection } from "@/lib/sales-orders/fabric-line-sort";

export type TableSortState<K extends string> = {
  key: K;
  direction: SortDirection;
};

export function nextTableSort<K extends string>(
  current: TableSortState<K> | null,
  key: K
): TableSortState<K> {
  if (current?.key === key) {
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key, direction: "asc" };
}

export function compareSortStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function compareSortNumbers(
  a: number | null | undefined,
  b: number | null | undefined
): number {
  const aMissing = a == null || !Number.isFinite(a);
  const bMissing = b == null || !Number.isFinite(b);
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return a - b;
}

export function applyTableSort<T, K extends string>(
  rows: T[],
  sort: TableSortState<K> | null,
  compare: (a: T, b: T, key: K) => number
): T[] {
  if (!sort) return rows;
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const cmp = compare(a, b, sort.key);
    return cmp === 0 ? 0 : cmp * direction;
  });
}
