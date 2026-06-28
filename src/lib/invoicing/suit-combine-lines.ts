import { formatCombinedGarmentDescription, getGarmentPieces } from "@/lib/sales-orders/label-codes";
import type { CustomerInvoiceLine } from "@/lib/types/customer-invoices";

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function orderedPieceNames(garmentType: string, pieceNames: string[]): string[] {
  const order = getGarmentPieces(garmentType);
  return [...pieceNames].sort((a, b) => {
    const indexA = order.indexOf(a);
    const indexB = order.indexOf(b);
    return (indexA === -1 ? order.length : indexA) - (indexB === -1 ? order.length : indexB);
  });
}

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

export function invoiceLineGroupKey(line: CustomerInvoiceLine): string | null {
  if (line.sales_order_line_id) return `sol:${line.sales_order_line_id}`;
  if (line.article_number != null) return `art:${line.article_number}:${line.garment_type}`;
  const fabricNumber = line.fabric_number?.trim();
  const fabricBrand = line.fabric_brand?.trim();
  if (fabricNumber && fabricBrand) {
    return `fab:${fabricBrand}|${fabricNumber}|${line.garment_type}`;
  }
  return null;
}

function mergeInvoiceLineGroup(group: CustomerInvoiceLine[]): CustomerInvoiceLine {
  const first = group[0]!;
  const garmentType = first.garment_type;
  const pieceNames = orderedPieceNames(
    garmentType,
    group.flatMap((line) => pieceNamesFromLine(line.piece_name))
  );
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
    description: formatCombinedGarmentDescription(garmentType, pieceNames),
    piece_name: pieceNames.join(" + "),
    sticker_code: first.sticker_code,
    composition,
    weight_gsm: weightGsm,
    quantity: 1,
    unit_price: unitPrice,
    line_total: lineTotal,
    cost_hint_sar: costHint,
    fabric_cost_hint_sar: fabricCostHint,
  };
}

export type SuitCombineGroup = {
  group_key: string;
  line_ids: string[];
  lines: CustomerInvoiceLine[];
  merged: CustomerInvoiceLine;
};

function collectSuitCombineGroups(lines: CustomerInvoiceLine[]): {
  groups: Map<string, CustomerInvoiceLine[]>;
  firstIndex: Map<string, number>;
} {
  const firstIndex = new Map<string, number>();
  const groups = new Map<string, CustomerInvoiceLine[]>();

  lines.forEach((line, index) => {
    if (!isMultiPieceGarment(line.garment_type) || isCombinedInvoiceLine(line)) return;

    const key = invoiceLineGroupKey(line);
    if (!key) return;

    if (!firstIndex.has(key)) firstIndex.set(key, index);
    const bucket = groups.get(key) ?? [];
    bucket.push(line);
    groups.set(key, bucket);
  });

  return { groups, firstIndex };
}

/** Groups of split jacket/trouser (etc.) lines that can merge into one row per fabric line. */
export function suggestSuitCombineGroups(lines: CustomerInvoiceLine[]): SuitCombineGroup[] {
  const { groups } = collectSuitCombineGroups(lines);
  const output: SuitCombineGroup[] = [];

  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    output.push({
      group_key: key,
      line_ids: group.map((line) => line.id),
      lines: group,
      merged: mergeInvoiceLineGroup(group),
    });
  }

  return output.sort((a, b) => b.lines.length - a.lines.length);
}

export function applySuitCombine(
  lines: CustomerInvoiceLine[],
  groupKeys?: string[]
): CustomerInvoiceLine[] {
  const { groups, firstIndex } = collectSuitCombineGroups(lines);
  const keysToApply = new Set(
    groupKeys ?? [...groups.keys()].filter((key) => (groups.get(key)?.length ?? 0) > 1)
  );
  if (keysToApply.size === 0) return lines;

  const mergedIds = new Set<string>();
  const inserted: { index: number; line: CustomerInvoiceLine }[] = [];

  for (const [key, group] of groups) {
    if (!keysToApply.has(key) || group.length < 2) continue;
    for (const line of group) mergedIds.add(line.id);
    inserted.push({
      index: firstIndex.get(key) ?? 0,
      line: mergeInvoiceLineGroup(group),
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

/** Combine jacket+trouser (and similar sets) that share the same fabric line on an invoice. */
export function combineInvoiceLines(lines: CustomerInvoiceLine[]): CustomerInvoiceLine[] {
  const { groups, firstIndex } = collectSuitCombineGroups(lines);
  const standalone: { index: number; line: CustomerInvoiceLine }[] = [];

  lines.forEach((line, index) => {
    if (!isMultiPieceGarment(line.garment_type) || isCombinedInvoiceLine(line)) {
      standalone.push({ index, line });
      return;
    }

    const key = invoiceLineGroupKey(line);
    if (!key || (groups.get(key)?.length ?? 0) <= 1) {
      standalone.push({ index, line });
    }
  });

  const output: { index: number; line: CustomerInvoiceLine }[] = [...standalone];

  for (const [key, group] of groups) {
    const index = firstIndex.get(key) ?? 0;
    if (group.length > 1) {
      output.push({ index, line: mergeInvoiceLineGroup(group) });
    }
  }

  return output.sort((a, b) => a.index - b.index).map((row) => row.line);
}

export { isCombinedInvoiceLine, pieceNamesFromLine };
