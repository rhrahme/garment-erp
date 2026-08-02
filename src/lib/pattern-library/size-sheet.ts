import type { BasePattern, BasePatternClientColumn } from "@/lib/types/pattern-library";

/** One row on the per-size working sheet: base value pre-filled, trials handwritten. */
export interface BaseSizeSheetRow {
  point_id: string;
  name: string;
  remark: string | null;
  is_graded: boolean;
  base_value: number | null;
  /** Client fit column value at this point - only set when printing a client sheet. */
  client_value?: number | null;
}

/**
 * Rows for the printable per-size A4 working sheet, in the pattern's point
 * order. Trim points (constant across sizes) fall back to the first documented
 * value when the exact size cell is empty — same rule as client-pattern derivation.
 * Pass the client's fit column to add their adjusted values next to the base size.
 */
export function buildBaseSizeSheetRows(
  base: BasePattern,
  size: string,
  clientColumn?: BasePatternClientColumn | null
): BaseSizeSheetRow[] {
  return base.points.map((point) => {
    const fallback = point.is_graded
      ? null
      : Object.values(point.values).find((value) => value !== null) ?? null;
    const row: BaseSizeSheetRow = {
      point_id: point.point_id,
      name: point.name,
      remark: point.remark,
      is_graded: point.is_graded,
      base_value: point.values[size] ?? fallback,
    };
    if (clientColumn) {
      row.client_value = clientColumn.values[point.point_id] ?? null;
    }
    return row;
  });
}
