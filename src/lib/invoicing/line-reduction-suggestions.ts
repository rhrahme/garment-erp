import {
  applySuitCombine,
  suggestSuitCombineGroups,
} from "@/lib/invoicing/suit-combine-lines";
import {
  applyAllConsolidations,
  applyConsolidation,
  suggestConsolidationGroups,
  type ConsolidationOptions,
} from "@/lib/invoicing/consolidate-lines";
import { formatInvoiceComposition, formatInvoiceWeight, toInvoiceLineDisplay } from "@/lib/invoicing/display";
import { formatInvoiceSar } from "@/lib/invoicing/format-amount";
import type { CustomerInvoiceLine } from "@/lib/types/customer-invoices";

export type LineReductionSuggestionType =
  | "combine_suit_pieces"
  | "consolidate_duplicates"
  | "consolidate_shirts";

export type LineReductionSuggestion = {
  type: LineReductionSuggestionType;
  title: string;
  explanation: string;
  /** Unique id for apply — prefixed by type. */
  group_key: string;
  /** Raw key passed to applySuitCombine or applyConsolidation. */
  internal_key: string;
  from_line_count: number;
  to_line_count: number;
  line_ids: string[];
  preview_description: string;
};

export type LineReductionOptions = ConsolidationOptions;

const SUIT_GROUP_PREFIX = "combine_suit:";
const CONSOLIDATE_GROUP_PREFIX = "consolidate:";

function isShirtGarmentType(garmentType: string): boolean {
  return garmentType.toLowerCase().includes("shirt");
}

function formatConsolidationPreview(
  lines: CustomerInvoiceLine[],
  merged: CustomerInvoiceLine
): string {
  const display = toInvoiceLineDisplay(lines[0]!);
  const composition = formatInvoiceComposition(lines[0]!.composition);
  const weight =
    lines[0]!.weight_gsm != null ? formatInvoiceWeight(lines[0]!.weight_gsm) : "—";
  return `${display.description} · ${composition} · ${weight} · ${formatInvoiceSar(merged.unit_price)} × qty ${merged.quantity}`;
}

function suitCombineSuggestion(group: ReturnType<typeof suggestSuitCombineGroups>[number]): LineReductionSuggestion {
  const garmentType = group.lines[0]!.garment_type;
  const pieceCount = group.lines.length;
  const preview = group.merged.description;

  return {
    type: "combine_suit_pieces",
    title: `Combine ${garmentType} pieces`,
    explanation: `${pieceCount} separate rows for the same ${garmentType.toLowerCase()} fabric line (e.g. jacket and trouser) can be one line with the combined description and summed price.`,
    group_key: `${SUIT_GROUP_PREFIX}${group.group_key}`,
    internal_key: group.group_key,
    from_line_count: pieceCount,
    to_line_count: 1,
    line_ids: group.line_ids,
    preview_description: preview,
  };
}

function consolidationSuggestion(
  group: ReturnType<typeof suggestConsolidationGroups>[number],
  options?: LineReductionOptions
): LineReductionSuggestion {
  const garmentType = group.lines[0]!.garment_type;
  const isShirt = isShirtGarmentType(garmentType);
  const type: LineReductionSuggestionType = isShirt ? "consolidate_shirts" : "consolidate_duplicates";

  return {
    type,
    title: isShirt ? "Consolidate matching shirts" : "Consolidate duplicate lines",
    explanation: isShirt
      ? `${group.lines.length} shirt rows share the same composition, weight, and unit price — merge into one line with combined quantity.`
      : `${group.lines.length} rows share the same garment type, composition, weight, and unit price — merge into one line with combined quantity.`,
    group_key: `${CONSOLIDATE_GROUP_PREFIX}${group.key}`,
    internal_key: group.key,
    from_line_count: group.lines.length,
    to_line_count: 1,
    line_ids: group.line_ids,
    preview_description: formatConsolidationPreview(group.lines, group.merged),
  };
}

/** Detect all ways to reduce invoice line count (suit combine + duplicate consolidation). */
export function detectInvoiceLineReductions(
  lines: CustomerInvoiceLine[],
  options?: LineReductionOptions
): LineReductionSuggestion[] {
  const suggestions: LineReductionSuggestion[] = [];

  for (const group of suggestSuitCombineGroups(lines)) {
    suggestions.push(suitCombineSuggestion(group));
  }

  for (const group of suggestConsolidationGroups(lines, options)) {
    suggestions.push(consolidationSuggestion(group, options));
  }

  return suggestions.sort((a, b) => b.from_line_count - a.from_line_count);
}

export function lineCountAfterReductions(
  lineCount: number,
  suggestions: LineReductionSuggestion[]
): number {
  const saved = suggestions.reduce((sum, suggestion) => sum + suggestion.from_line_count - suggestion.to_line_count, 0);
  return lineCount - saved;
}

function parseSuggestionKey(groupKey: string): { type: LineReductionSuggestionType; internal_key: string } | null {
  if (groupKey.startsWith(SUIT_GROUP_PREFIX)) {
    return { type: "combine_suit_pieces", internal_key: groupKey.slice(SUIT_GROUP_PREFIX.length) };
  }
  if (groupKey.startsWith(CONSOLIDATE_GROUP_PREFIX)) {
    const internal_key = groupKey.slice(CONSOLIDATE_GROUP_PREFIX.length);
    const garmentType = internal_key.split("|")[0] ?? "";
    const type: LineReductionSuggestionType = isShirtGarmentType(garmentType)
      ? "consolidate_shirts"
      : "consolidate_duplicates";
    return { type, internal_key };
  }
  return null;
}

/** Apply a single line-reduction suggestion. */
export function applyInvoiceLineReduction(
  lines: CustomerInvoiceLine[],
  suggestion: LineReductionSuggestion,
  options?: LineReductionOptions
): CustomerInvoiceLine[] {
  if (suggestion.type === "combine_suit_pieces") {
    return applySuitCombine(lines, [suggestion.internal_key]);
  }
  return applyConsolidation(lines, [suggestion.internal_key], options);
}

/** Apply suggestions by group_key (suit combine runs before consolidation when both requested). */
export function applyInvoiceLineReductionsByKeys(
  lines: CustomerInvoiceLine[],
  groupKeys: string[],
  options?: LineReductionOptions
): CustomerInvoiceLine[] {
  if (groupKeys.length === 0) return lines;

  const suitKeys: string[] = [];
  const consolidateKeys: string[] = [];

  for (const groupKey of groupKeys) {
    const parsed = parseSuggestionKey(groupKey);
    if (!parsed) continue;
    if (parsed.type === "combine_suit_pieces") suitKeys.push(parsed.internal_key);
    else consolidateKeys.push(parsed.internal_key);
  }

  let current = suitKeys.length > 0 ? applySuitCombine(lines, suitKeys) : lines;
  if (consolidateKeys.length > 0) {
    current = applyConsolidation(current, consolidateKeys, options);
  }
  return current;
}

/** Apply all detected reductions: suit pieces first, then duplicate consolidation. */
export function applyAllInvoiceLineReductions(
  lines: CustomerInvoiceLine[],
  options?: LineReductionOptions
): CustomerInvoiceLine[] {
  const combined = applySuitCombine(lines);
  return applyAllConsolidations(combined, options);
}
