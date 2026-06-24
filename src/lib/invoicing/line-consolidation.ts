import { getGarmentPieces } from "@/lib/sales-orders/label-codes";
import { sortInvoiceLinesByArticle } from "@/lib/invoicing/display";
import type { CustomerInvoiceLine } from "@/lib/types/customer-invoices";

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export type InvoiceLineMergeKeyField =
  | "garment_type"
  | "composition"
  | "weight_gsm"
  | "unit_price"
  | "fabric_brand";

export const DEFAULT_MERGE_KEY_FIELDS: InvoiceLineMergeKeyField[] = [
  "garment_type",
  "composition",
  "weight_gsm",
  "unit_price",
  "fabric_brand",
];

function pieceNamesFromLine(pieceName: string | null): string[] {
  if (!pieceName?.trim()) return [];
  if (pieceName.includes(" + ")) return pieceName.split(" + ").map((name) => name.trim());
  return [pieceName.trim()];
}

function isMultiPieceGarment(garmentType: string): boolean {
  return getGarmentPieces(garmentType).length > 1;
}

function isCombinedInvoiceLine(line: CustomerInvoiceLine): boolean {
  return pieceNamesFromLine(line.piece_name).length > 1;
}

/** Skip jacket/trouser splits — only whole garments or already-combined sets. */
export function canConsolidateInvoiceLine(line: CustomerInvoiceLine): boolean {
  if (!isMultiPieceGarment(line.garment_type)) return true;
  return isCombinedInvoiceLine(line);
}

function normalizeMergeKeyValue(field: InvoiceLineMergeKeyField, value: unknown): string {
  if (field === "composition" || field === "fabric_brand") {
    return String(value ?? "")
      .trim()
      .toLowerCase();
  }
  if (field === "weight_gsm") {
    return value == null || !Number.isFinite(Number(value)) ? "" : String(value);
  }
  if (field === "unit_price") {
    return Number.isFinite(Number(value)) ? String(roundMoney(Number(value))) : "";
  }
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function buildInvoiceLineMergeKey(
  line: CustomerInvoiceLine,
  fields: InvoiceLineMergeKeyField[] = DEFAULT_MERGE_KEY_FIELDS
): string {
  return fields.map((field) => normalizeMergeKeyValue(field, line[field])).join("|");
}

export type InvoiceLineConsolidationGroup = {
  id: string;
  merge_key: string;
  line_ids: string[];
  lines: CustomerInvoiceLine[];
  merged: CustomerInvoiceLine;
};

export function findInvoiceLineConsolidationGroups(
  lines: CustomerInvoiceLine[],
  fields: InvoiceLineMergeKeyField[] = DEFAULT_MERGE_KEY_FIELDS
): InvoiceLineConsolidationGroup[] {
  const buckets = new Map<string, CustomerInvoiceLine[]>();

  for (const line of lines) {
    if (!canConsolidateInvoiceLine(line)) continue;
    const key = buildInvoiceLineMergeKey(line, fields);
    const bucket = buckets.get(key) ?? [];
    bucket.push(line);
    buckets.set(key, bucket);
  }

  const groups: InvoiceLineConsolidationGroup[] = [];
  for (const [mergeKey, bucket] of buckets) {
    if (bucket.length < 2) continue;
    const sorted = sortInvoiceLinesByArticle(bucket);
    const merged = mergeInvoiceLineDisplayGroup(sorted);
    groups.push({
      id: mergeKey,
      merge_key: mergeKey,
      line_ids: sorted.map((line) => line.id),
      lines: sorted,
      merged,
    });
  }

  return groups.sort((a, b) => b.lines.length - a.lines.length);
}

/** Merge identical client-facing lines (qty sum, totals sum) — INV-2026-0004 pattern. */
export function mergeInvoiceLineDisplayGroup(group: CustomerInvoiceLine[]): CustomerInvoiceLine {
  const first = group[0]!;
  const quantity = group.reduce((sum, line) => sum + line.quantity, 0);
  const unitPrice = first.unit_price;
  const lineTotal = roundMoney(group.reduce((sum, line) => sum + line.line_total, 0));
  const costHints = group.map((line) => line.cost_hint_sar).filter((hint): hint is number => hint != null);
  const costHint =
    costHints.length > 0 ? roundMoney(costHints.reduce((sum, hint) => sum + hint, 0)) : null;

  return {
    ...first,
    quantity,
    unit_price: unitPrice,
    line_total: lineTotal,
    cost_hint_sar: costHint,
    fabric_number: null,
    sticker_code: first.sticker_code,
    sales_order_line_id: first.sales_order_line_id,
  };
}

export function renumberInvoiceLineArticles(lines: CustomerInvoiceLine[]): CustomerInvoiceLine[] {
  return sortInvoiceLinesByArticle(lines).map((line, index) => ({
    ...line,
    article_number: index + 1,
  }));
}

export function applyInvoiceLineConsolidationGroups(
  lines: CustomerInvoiceLine[],
  groups: InvoiceLineConsolidationGroup[]
): CustomerInvoiceLine[] {
  if (groups.length === 0) return lines;

  const mergedIds = new Set(groups.flatMap((group) => group.line_ids));
  const firstIndex = new Map<string, number>();
  lines.forEach((line, index) => {
    if (!firstIndex.has(line.id)) firstIndex.set(line.id, index);
  });

  const kept = lines.filter((line) => !mergedIds.has(line.id));
  const inserted = groups.map((group) => ({
    index: Math.min(...group.line_ids.map((id) => firstIndex.get(id) ?? Number.MAX_SAFE_INTEGER)),
    line: group.merged,
  }));

  const output = [
    ...kept.map((line) => ({ index: firstIndex.get(line.id) ?? 0, line })),
    ...inserted,
  ];

  return renumberInvoiceLineArticles(
    output.sort((a, b) => a.index - b.index).map((row) => row.line)
  );
}

export function applyAllInvoiceLineConsolidations(
  lines: CustomerInvoiceLine[],
  fields: InvoiceLineMergeKeyField[] = DEFAULT_MERGE_KEY_FIELDS
): CustomerInvoiceLine[] {
  const groups = findInvoiceLineConsolidationGroups(lines, fields);
  return applyInvoiceLineConsolidationGroups(lines, groups);
}

export function summarizeInvoiceLineConsolidation(
  lines: CustomerInvoiceLine[],
  fields: InvoiceLineMergeKeyField[] = DEFAULT_MERGE_KEY_FIELDS
): { before: number; after: number; groups: InvoiceLineConsolidationGroup[] } {
  const groups = findInvoiceLineConsolidationGroups(lines, fields);
  const after = lines.length - groups.reduce((sum, group) => sum + group.lines.length - 1, 0);
  return { before: lines.length, after, groups };
}
