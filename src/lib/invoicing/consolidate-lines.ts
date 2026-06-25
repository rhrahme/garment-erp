import { getGarmentPieces } from "@/lib/sales-orders/label-codes";
import { formatClientInvoiceComposition, sortInvoiceLinesByArticle } from "@/lib/invoicing/display";
import type { CustomerInvoiceLine } from "@/lib/types/customer-invoices";

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export type ConsolidationOptions = {
  /** When true, lines must share fabric_brand to merge. Default false. */
  includeFabricBrand?: boolean;
};

export type ConsolidationGroup = {
  key: string;
  line_ids: string[];
  lines: CustomerInvoiceLine[];
  merged: CustomerInvoiceLine;
};

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
  if (line.unit_price === 0) return false;
  if (!isMultiPieceGarment(line.garment_type)) return true;
  return isCombinedInvoiceLine(line);
}

export function normalizeInvoiceCompositionKey(composition: string | null | undefined): string {
  const raw = composition?.trim();
  if (!raw) return "";
  return formatClientInvoiceComposition(raw).toLowerCase();
}

function normalizeMergeKeyValue(
  field: "garment_type" | "composition" | "weight_gsm" | "unit_price" | "fabric_brand",
  line: CustomerInvoiceLine
): string {
  if (field === "composition") return normalizeInvoiceCompositionKey(line.composition);
  if (field === "fabric_brand") return String(line.fabric_brand ?? "").trim().toLowerCase();
  if (field === "weight_gsm") {
    return line.weight_gsm == null || !Number.isFinite(line.weight_gsm) ? "" : String(line.weight_gsm);
  }
  if (field === "unit_price") {
    return Number.isFinite(line.unit_price) ? String(roundMoney(line.unit_price)) : "";
  }
  return String(line.garment_type ?? "").trim().toLowerCase();
}

export function buildConsolidationMergeKey(
  line: CustomerInvoiceLine,
  options?: ConsolidationOptions
): string {
  const fields: Array<"garment_type" | "composition" | "weight_gsm" | "unit_price" | "fabric_brand"> = [
    "garment_type",
    "composition",
    "weight_gsm",
    "unit_price",
  ];
  if (options?.includeFabricBrand) fields.push("fabric_brand");
  return fields.map((field) => normalizeMergeKeyValue(field, line)).join("|");
}

function mergeConsolidationGroup(group: CustomerInvoiceLine[]): CustomerInvoiceLine {
  const first = group[0]!;
  const quantity = group.reduce((sum, line) => sum + line.quantity, 0);
  const lineTotal = roundMoney(group.reduce((sum, line) => sum + line.line_total, 0));
  const costHints = group.map((line) => line.cost_hint_sar).filter((hint): hint is number => hint != null);
  const costHint =
    costHints.length > 0 ? roundMoney(costHints.reduce((sum, hint) => sum + hint, 0)) : null;
  const fabricCostHints = group
    .map((line) => line.fabric_cost_hint_sar)
    .filter((hint): hint is number => hint != null);
  const fabricCostHint =
    fabricCostHints.length > 0 ? roundMoney(fabricCostHints.reduce((sum, hint) => sum + hint, 0)) : null;

  const fabricNumbers = new Set(
    group.map((line) => line.fabric_number?.trim()).filter((value): value is string => Boolean(value))
  );

  return {
    ...first,
    quantity,
    unit_price: first.unit_price,
    line_total: lineTotal,
    cost_hint_sar: costHint,
    fabric_cost_hint_sar: fabricCostHint,
    fabric_number: fabricNumbers.size <= 1 ? (first.fabric_number?.trim() || null) : null,
  };
}

export function suggestConsolidationGroups(
  lines: CustomerInvoiceLine[],
  options?: ConsolidationOptions
): ConsolidationGroup[] {
  const buckets = new Map<string, CustomerInvoiceLine[]>();

  for (const line of lines) {
    if (!canConsolidateInvoiceLine(line)) continue;
    const key = buildConsolidationMergeKey(line, options);
    const bucket = buckets.get(key) ?? [];
    bucket.push(line);
    buckets.set(key, bucket);
  }

  const groups: ConsolidationGroup[] = [];
  for (const [key, bucket] of buckets) {
    if (bucket.length < 2) continue;
    const sorted = sortInvoiceLinesByArticle(bucket);
    groups.push({
      key,
      line_ids: sorted.map((line) => line.id),
      lines: sorted,
      merged: mergeConsolidationGroup(sorted),
    });
  }

  return groups.sort((a, b) => b.lines.length - a.lines.length);
}

export function renumberInvoiceArticles(lines: CustomerInvoiceLine[]): CustomerInvoiceLine[] {
  return sortInvoiceLinesByArticle(lines).map((line, index) => ({
    ...line,
    article_number: index + 1,
  }));
}

export function applyConsolidation(
  lines: CustomerInvoiceLine[],
  groupKeys: string[],
  options?: ConsolidationOptions
): CustomerInvoiceLine[] {
  if (groupKeys.length === 0) return lines;

  const groups = suggestConsolidationGroups(lines, options).filter((group) =>
    groupKeys.includes(group.key)
  );
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

  return renumberInvoiceArticles(
    output.sort((a, b) => a.index - b.index).map((row) => row.line)
  );
}

export function applyAllConsolidations(
  lines: CustomerInvoiceLine[],
  options?: ConsolidationOptions
): CustomerInvoiceLine[] {
  const keys = suggestConsolidationGroups(lines, options).map((group) => group.key);
  return applyConsolidation(lines, keys, options);
}
