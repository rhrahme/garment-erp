import { normalizeInvoiceCompositionKey } from "@/lib/invoicing/consolidate-lines";
import { formatCombinedGarmentDescription } from "@/lib/sales-orders/label-codes";
import type { CustomerInvoiceLine } from "@/lib/types/customer-invoices";
import { isCombinedInvoiceLine, pieceNamesFromLine } from "@/lib/invoicing/suit-combine-lines";

const CROSS_SUIT_GARMENT_TYPES = new Set(["Jacket", "Trouser"]);

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function crossFabricSuitGroupKey(line: CustomerInvoiceLine): string | null {
  if (!CROSS_SUIT_GARMENT_TYPES.has(line.garment_type)) return null;
  if (isCombinedInvoiceLine(line)) return null;
  const fabricNumber = line.fabric_number?.trim();
  if (!fabricNumber) return null;
  const composition = normalizeInvoiceCompositionKey(line.composition);
  return `cross_suit:${fabricNumber.toLowerCase()}|${composition}`;
}

function mergeCrossFabricSuitGroup(group: CustomerInvoiceLine[]): CustomerInvoiceLine {
  const sorted = [...group].sort((a, b) => (a.article_number ?? 0) - (b.article_number ?? 0));
  const first = sorted[0]!;
  const pieceNames = sorted.map((line) => {
    if (line.garment_type === "Jacket") return "Jacket";
    if (line.garment_type === "Trouser") return "Trouser";
    const names = pieceNamesFromLine(line.piece_name);
    return names[0] ?? line.garment_type;
  });
  const uniquePieces = [...new Set(pieceNames)];
  const orderedPieces =
    uniquePieces.includes("Jacket") && uniquePieces.includes("Trouser")
      ? ["Jacket", "Trouser"]
      : uniquePieces;

  const unitPrice = roundMoney(group.reduce((sum, line) => sum + line.unit_price, 0));
  const lineTotal = roundMoney(group.reduce((sum, line) => sum + line.line_total, 0));
  const costHints = group.map((line) => line.cost_hint_sar).filter((hint): hint is number => hint != null);
  const costHint = costHints.length > 0 ? roundMoney(costHints.reduce((sum, hint) => sum + hint, 0)) : null;
  const fabricCostHints = group
    .map((line) => line.fabric_cost_hint_sar)
    .filter((hint): hint is number => hint != null);
  const fabricCostHint =
    fabricCostHints.length > 0 ? roundMoney(fabricCostHints.reduce((sum, hint) => sum + hint, 0)) : null;
  const composition =
    group.map((line) => line.composition?.trim()).find((value): value is string => Boolean(value)) ?? null;
  const weightGsm = group.find((line) => line.weight_gsm != null)?.weight_gsm ?? null;

  return {
    ...first,
    garment_type: "Suit",
    description: formatCombinedGarmentDescription("Suit", orderedPieces),
    piece_name: orderedPieces.join(" + "),
    sales_order_line_id: null,
    composition,
    weight_gsm: weightGsm,
    quantity: 1,
    unit_price: unitPrice,
    line_total: lineTotal,
    cost_hint_sar: costHint,
    fabric_cost_hint_sar: fabricCostHint,
  };
}

export type CrossFabricSuitGroup = {
  group_key: string;
  line_ids: string[];
  lines: CustomerInvoiceLine[];
  merged: CustomerInvoiceLine;
};

function collectCrossFabricSuitGroups(lines: CustomerInvoiceLine[]): {
  groups: Map<string, CustomerInvoiceLine[]>;
  firstIndex: Map<string, number>;
} {
  const firstIndex = new Map<string, number>();
  const groups = new Map<string, CustomerInvoiceLine[]>();

  lines.forEach((line, index) => {
    const key = crossFabricSuitGroupKey(line);
    if (!key) return;
    if (!firstIndex.has(key)) firstIndex.set(key, index);
    const bucket = groups.get(key) ?? [];
    bucket.push(line);
    groups.set(key, bucket);
  });

  return { groups, firstIndex };
}

/** Jacket + trouser on separate SO fabric lines sharing the same fabric number. */
export function suggestCrossFabricSuitGroups(lines: CustomerInvoiceLine[]): CrossFabricSuitGroup[] {
  const { groups } = collectCrossFabricSuitGroups(lines);
  const output: CrossFabricSuitGroup[] = [];

  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const garmentTypes = new Set(group.map((line) => line.garment_type));
    if (!garmentTypes.has("Jacket") || !garmentTypes.has("Trouser")) continue;
    output.push({
      group_key: key,
      line_ids: group.map((line) => line.id),
      lines: group,
      merged: mergeCrossFabricSuitGroup(group),
    });
  }

  return output.sort((a, b) => b.lines.length - a.lines.length);
}

export function applyCrossFabricSuitCombine(
  lines: CustomerInvoiceLine[],
  groupKeys?: string[]
): CustomerInvoiceLine[] {
  const { groups, firstIndex } = collectCrossFabricSuitGroups(lines);
  const eligible = [...groups.entries()].filter(([, group]) => {
    if (group.length < 2) return false;
    const garmentTypes = new Set(group.map((line) => line.garment_type));
    return garmentTypes.has("Jacket") && garmentTypes.has("Trouser");
  });
  const keysToApply = new Set(
    groupKeys ?? eligible.map(([key]) => key)
  );
  if (keysToApply.size === 0) return lines;

  const mergedIds = new Set<string>();
  const inserted: { index: number; line: CustomerInvoiceLine }[] = [];

  for (const [key, group] of eligible) {
    if (!keysToApply.has(key)) continue;
    for (const line of group) mergedIds.add(line.id);
    inserted.push({
      index: firstIndex.get(key) ?? 0,
      line: mergeCrossFabricSuitGroup(group),
    });
  }

  const lineFirstIndex = new Map<string, number>();
  lines.forEach((line, index) => {
    if (!lineFirstIndex.has(line.id)) lineFirstIndex.set(line.id, index);
  });

  const kept = lines
    .filter((line) => !mergedIds.has(line.id))
    .map((line) => ({ index: lineFirstIndex.get(line.id) ?? 0, line }));

  return [...kept, ...inserted]
    .sort((a, b) => a.index - b.index)
    .map((row) => row.line);
}
