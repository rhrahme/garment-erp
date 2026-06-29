import type { CustomerInvoiceLine } from "@/lib/types/customer-invoices";
import { getGarmentPieces } from "@/lib/sales-orders/label-codes";
import { isCombinedInvoiceLine } from "@/lib/invoicing/suit-combine-lines";

function isMultiPieceGarment(garmentType: string): boolean {
  return getGarmentPieces(garmentType).length > 1;
}

/** Strip Canclini-style catalog prefix for duplicate comparison. */
export function normalizeInvoiceFabricNumber(fabricNumber: string | null | undefined): string {
  const trimmed = fabricNumber?.trim() ?? "";
  if (!trimmed) return "";
  return trimmed.replace(/^C/i, "").toLowerCase();
}

function lineQualityScore(line: CustomerInvoiceLine): number {
  let score = 0;
  if (line.unit_price > 0) score += 100;
  if (line.cost_hint_sar != null && line.cost_hint_sar > 0) score += 50;
  if (line.composition?.trim()) score += 20;
  if (line.fabric_cost_hint_sar != null) score += 10;
  return score;
}

function pickBestLine(group: CustomerInvoiceLine[]): CustomerInvoiceLine {
  return [...group].sort((a, b) => {
    const scoreDiff = lineQualityScore(b) - lineQualityScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return (a.article_number ?? Number.MAX_SAFE_INTEGER) - (b.article_number ?? Number.MAX_SAFE_INTEGER);
  })[0]!;
}

function duplicateGroupKey(line: CustomerInvoiceLine): string | null {
  if (isMultiPieceGarment(line.garment_type) && !isCombinedInvoiceLine(line)) return null;

  const sticker = line.sticker_code?.trim();
  if (sticker) return `sticker:${sticker}`;

  const fabricKey = normalizeInvoiceFabricNumber(line.fabric_number);
  if (!fabricKey) return null;
  const brand = String(line.fabric_brand ?? "").trim().toLowerCase();
  const garment = String(line.garment_type ?? "").trim().toLowerCase();
  const solId = line.sales_order_line_id?.trim() ?? "";
  return `fabric:${brand}|${fabricKey}|${garment}|${solId}`;
}

export type DuplicateLineGroup = {
  group_key: string;
  line_ids: string[];
  lines: CustomerInvoiceLine[];
  kept: CustomerInvoiceLine;
  removed_ids: string[];
};

function collectDuplicateGroups(lines: CustomerInvoiceLine[]): Map<string, CustomerInvoiceLine[]> {
  const groups = new Map<string, CustomerInvoiceLine[]>();
  for (const line of lines) {
    const key = duplicateGroupKey(line);
    if (!key) continue;
    const bucket = groups.get(key) ?? [];
    bucket.push(line);
    groups.set(key, bucket);
  }
  return groups;
}

/** Same sticker code or equivalent fabric number on multiple invoice rows. */
export function suggestDuplicateLineGroups(lines: CustomerInvoiceLine[]): DuplicateLineGroup[] {
  const groups = collectDuplicateGroups(lines);
  const output: DuplicateLineGroup[] = [];

  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const kept = pickBestLine(group);
    const removed_ids = group.filter((line) => line.id !== kept.id).map((line) => line.id);
    output.push({
      group_key: key,
      line_ids: group.map((line) => line.id),
      lines: group,
      kept,
      removed_ids,
    });
  }

  return output.sort((a, b) => b.lines.length - a.lines.length);
}

export function applyDuplicateLineRemoval(
  lines: CustomerInvoiceLine[],
  groupKeys?: string[]
): CustomerInvoiceLine[] {
  const groups = suggestDuplicateLineGroups(lines);
  const keysToApply = new Set(groupKeys ?? groups.map((group) => group.group_key));
  if (keysToApply.size === 0) return lines;

  const removeIds = new Set<string>();
  const replacements = new Map<string, CustomerInvoiceLine>();

  for (const group of groups) {
    if (!keysToApply.has(group.group_key)) continue;
    for (const id of group.removed_ids) removeIds.add(id);
    replacements.set(group.kept.id, group.kept);
  }

  if (removeIds.size === 0) return lines;

  return lines
    .filter((line) => !removeIds.has(line.id))
    .map((line) => replacements.get(line.id) ?? line);
}
