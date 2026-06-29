import {
  clientCodeFromReference,
  lineArticleFromStickerCode,
  pieceNamesFromInvoicePieceField,
  resolveCombinedGarmentType,
  resolveInvoiceGarmentDescription,
  formatCombinedGarmentDescription,
} from "@/lib/sales-orders/label-codes";
import type { CustomerInvoiceLine } from "@/lib/types/customer-invoices";

/** Client name on printed invoices — formal Mr prefix for bespoke clients. */
export function formatInvoiceClientName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  if (/^mr\.?\s/i.test(trimmed)) return trimmed;
  return `Mr ${trimmed}`;
}

/** Short client ref for invoices — SO is shown separately on the same block. */
export function formatInvoiceClientRef(
  clientCode: string,
  clientReference: string | null | undefined
): string | null {
  const code = clientCode.trim();
  if (code) return code;
  const ref = clientReference?.trim();
  if (!ref) return null;
  return clientCodeFromReference(ref);
}

export function formatInvoiceWeight(weightGsm: number | null | undefined): string {
  if (weightGsm == null || !Number.isFinite(weightGsm)) return "—";
  return `${weightGsm} gsm`;
}

const FABRIC_BRAND_ABBREVIATIONS: Record<string, string> = {
  drapers: "DP",
  "loro piana": "LP",
  canclini: "CC",
  stylbiella: "SB",
};

/** Client invoice fabric prefix — known mills only; unknown brands omit the prefix. */
export function formatInvoiceFabricBrandAbbreviation(
  brand: string | null | undefined
): string | null {
  const key = brand?.trim().toLowerCase();
  if (!key) return null;
  return FABRIC_BRAND_ABBREVIATIONS[key] ?? null;
}

function formatInvoiceWeightGrams(weightGsm: number | null | undefined): string | null {
  if (weightGsm == null || !Number.isFinite(weightGsm)) return null;
  return `${weightGsm}g`;
}

/** Mill yarn-count prefix before fibre content, e.g. "80-2,100-1-" or "80/2,100/1-". */
const INVOICE_YARN_PREFIX_RE =
  /^(?:\d+[-/]\d+)(?:[,.\s]+(?:\d+[-/]\d+))*-?(?=\d+%)/;

const INVOICE_FIBER_NAME_FIXES: [RegExp, string][] = [[/\bPolymide\b/gi, "Polyamide"]];

/** Factory yarn codes → client-facing fibre names (invoice display only). */
const INVOICE_FACTORY_FIBER_CODES: Record<string, string> = {
  WV: "Wool",
  WS: "Cashmere",
};

/** Expand factory abbreviations (WV, WS, C) to readable fibre names. */
function expandInvoiceFactoryFiberCodes(text: string): string {
  let result = text.replace(/\b(WV|WS)\b/gi, (match) => {
    return INVOICE_FACTORY_FIBER_CODES[match.toUpperCase()] ?? match;
  });

  // Cotton "C" only in composition context — after/before a percentage, not inside "CC" etc.
  result = result.replace(/(\d+%)\s+C\b/gi, "$1 Cotton");
  result = result.replace(/\bC\s+(\d+%)/gi, "Cotton $1");

  return result;
}

/** Client-facing composition — strip yarn notation and space out mashed fibre percentages. */
export function formatClientInvoiceComposition(composition: string): string {
  let text = composition.trim();
  const yarnPrefix = text.match(INVOICE_YARN_PREFIX_RE);
  if (yarnPrefix) text = text.slice(yarnPrefix[0].length);

  text = text
    .replace(/(\d+%)([A-Za-z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d+%)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  for (const [pattern, replacement] of INVOICE_FIBER_NAME_FIXES) {
    text = text.replace(pattern, replacement);
  }

  return expandInvoiceFactoryFiberCodes(text);
}

/** Client-facing composition cell: "{brand_abbr} {composition} {weight}" e.g. "DP 100% Wool 260g". */
export function formatInvoiceCompositionLine(
  brand: string | null | undefined,
  composition: string | null | undefined,
  weightGsm?: number | null | undefined
): string {
  const parts: string[] = [];
  const abbr = formatInvoiceFabricBrandAbbreviation(brand);
  if (abbr) parts.push(abbr);
  const comp = composition?.trim();
  if (comp) parts.push(formatClientInvoiceComposition(comp));
  const weight = formatInvoiceWeightGrams(weightGsm);
  if (weight) parts.push(weight);
  return parts.length > 0 ? parts.join(" ") : "—";
}

export function formatInvoiceComposition(composition: string | null | undefined): string {
  const raw = composition?.trim();
  if (!raw) return "—";
  return formatClientInvoiceComposition(raw);
}

/** Prefer stored invoice line composition; fall back to linked sales-order fabric line. */
export function resolveInvoiceComposition(
  line: Pick<CustomerInvoiceLine, "composition">,
  fabricLine?: { composition?: string | null } | null
): string | null {
  const fromLine = line.composition?.trim();
  if (fromLine) return fromLine;
  const fromFabric = fabricLine?.composition?.trim();
  return fromFabric || null;
}

/** Fabric supplier + number, e.g. "Loro Piana 760002". */
export function formatInvoiceFabricBrand(
  brand: string | null | undefined,
  fabricNumber?: string | null | undefined
): string {
  const label = brand?.trim();
  const number = fabricNumber?.trim();
  if (label && number) return `${label} ${number}`;
  if (number) return number;
  return label || "—";
}

export function formatInvoiceArticle(articleNumber: number | null | undefined): string {
  if (articleNumber == null || !Number.isFinite(articleNumber)) return "—";
  return `L${String(articleNumber).padStart(2, "0")}`;
}

/** Fill article_number from sticker code when missing on stored invoice lines. */
export function resolveInvoiceLineArticle(line: CustomerInvoiceLine): CustomerInvoiceLine {
  if (line.article_number != null && Number.isFinite(line.article_number)) return line;
  if (line.sticker_code) {
    const fromSticker = lineArticleFromStickerCode(line.sticker_code);
    if (fromSticker != null) return { ...line, article_number: fromSticker };
  }
  return line;
}

function resolveInvoiceLineDescription(line: CustomerInvoiceLine): string {
  const pieceNames = pieceNamesFromInvoicePieceField(line.piece_name);
  if (pieceNames.length > 1) {
    const garmentType = resolveCombinedGarmentType(line.garment_type, pieceNames);
    return formatCombinedGarmentDescription(garmentType, pieceNames);
  }
  return line.description;
}

export function resolveInvoiceLines(lines: CustomerInvoiceLine[]): CustomerInvoiceLine[] {
  return lines.map(resolveInvoiceLineArticle);
}

export type CustomerInvoiceLineDisplay = CustomerInvoiceLine & {
  article_label: string;
  composition_label: string;
};

export function toInvoiceLineDisplay(line: CustomerInvoiceLine): CustomerInvoiceLineDisplay {
  const resolved = resolveInvoiceLineArticle(line);
  const composition = resolveInvoiceComposition(resolved);
  return {
    ...resolved,
    composition,
    description: resolveInvoiceLineDescription(resolved),
    article_label: formatInvoiceArticle(resolved.article_number),
    composition_label: formatInvoiceCompositionLine(
      resolved.fabric_brand,
      composition,
      resolved.weight_gsm
    ),
  };
}

export function sortInvoiceLinesByArticle(lines: CustomerInvoiceLine[]): CustomerInvoiceLine[] {
  return [...lines].sort((a, b) => {
    const artA = a.article_number ?? Number.MAX_SAFE_INTEGER;
    const artB = b.article_number ?? Number.MAX_SAFE_INTEGER;
    if (artA !== artB) return artA - artB;
    return a.id.localeCompare(b.id);
  });
}
