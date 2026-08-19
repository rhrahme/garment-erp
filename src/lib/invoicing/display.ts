import {
  clientCodeFromReference,
  lineArticleFromStickerCode,
  pieceNamesFromInvoicePieceField,
  resolveCombinedGarmentType,
  resolveInvoiceGarmentDescription,
} from "@/lib/sales-orders/label-codes";
import { getLabelCountForGarment } from "@/lib/sales-orders/garment-types";
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
  solbiati: "SOLB",
  zegna: "ZE",
  "ermenegildo zegna": "ZE",
  caccioppoli: "Cacci",
  canclini: "CC",
  stylbiella: "SB",
};

function invoiceBrandLookupKey(brand: string): string {
  return brand.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

/** Client invoice fabric prefix — known mills only; unknown brands omit the prefix. */
export function formatInvoiceFabricBrandAbbreviation(
  brand: string | null | undefined
): string | null {
  const key = brand ? invoiceBrandLookupKey(brand) : "";
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

/** Words that belong on the invoice fibre line. Collection names (PEGASO, SUMMERTIME) do not. */
const INVOICE_FIBER_WORDS: Record<string, string> = {
  wool: "Wool",
  merino: "Merino",
  superfine: "Superfine",
  cashmere: "Cashmere",
  cotton: "Cotton",
  cotone: "Cotton",
  linen: "Linen",
  lino: "Linen",
  silk: "Silk",
  seta: "Silk",
  viscose: "Viscose",
  polyester: "Polyester",
  polyamide: "Polyamide",
  elastane: "Elastane",
  lycra: "Lycra",
  mohair: "Mohair",
  alpaca: "Alpaca",
  nylon: "Nylon",
  hemp: "Hemp",
  ramie: "Ramie",
  modal: "Modal",
  tencel: "Tencel",
  acetate: "Acetate",
  cupro: "Cupro",
  flax: "Flax",
  knit: "Knit",
  wv: "Wool",
  ws: "Cashmere",
  co: "Cotton",
  c: "Cotton",
  li: "Linen",
  se: "Silk",
  ea: "EA",
  el: "Elastane",
  pa: "Polyamide",
  pl: "Polyester",
  pes: "Polyester",
  cv: "Viscose",
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

function stripInvoiceCompositionNoise(composition: string): string {
  let text = composition.trim();
  const yarnPrefix = text.match(INVOICE_YARN_PREFIX_RE);
  if (yarnPrefix) text = text.slice(yarnPrefix[0].length);

  text = text
    .replace(/"([^"]*)"/g, (_match, inner: string) =>
      /\bknit\b/i.test(inner) ? " Knit " : " "
    )
    .replace(/\([^)]*\)/g, " ")
    .replace(/(\d+%)([A-Za-z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d+%)/g, "$1 $2")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const [pattern, replacement] of INVOICE_FIBER_NAME_FIXES) {
    text = text.replace(pattern, replacement);
  }

  return expandInvoiceFactoryFiberCodes(text);
}

/** Fibre-only client line: drop mill collection names such as PEGASO DELAVE. */
export function formatInvoiceFibreContent(composition: string): string {
  const tokens = stripInvoiceCompositionNoise(composition).split(" ").filter(Boolean);
  const kept: string[] = [];
  let started = false;
  for (const token of tokens) {
    if (/^\d+%$/.test(token)) {
      started = true;
      kept.push(token);
      continue;
    }
    if (!started) continue;
    const fiber = INVOICE_FIBER_WORDS[token.toLowerCase().replace(/[^a-z]/g, "")];
    if (fiber) kept.push(fiber);
  }
  if (/\bknit\b/i.test(stripInvoiceCompositionNoise(composition)) && !kept.includes("Knit")) {
    kept.push("Knit");
  }
  return kept.join(" ");
}

/** Full cleaned composition (yarn stripped). Used for merge keys, not the printed cell. */
export function formatClientInvoiceComposition(composition: string): string {
  return stripInvoiceCompositionNoise(composition);
}

/** Client-facing composition cell: "{brand_abbr} {fibre} {weight}" e.g. "SOLB 100% Linen 340g". */
export function formatInvoiceCompositionLine(
  brand: string | null | undefined,
  composition: string | null | undefined,
  weightGsm?: number | null | undefined
): string {
  const parts: string[] = [];
  const abbr = formatInvoiceFabricBrandAbbreviation(brand);
  if (abbr) parts.push(abbr);
  const fibre = composition?.trim() ? formatInvoiceFibreContent(composition) : "";
  if (fibre) parts.push(fibre);
  const weight = formatInvoiceWeightGrams(weightGsm);
  if (weight) parts.push(weight);
  return parts.length > 0 ? parts.join(" ") : "—";
}

export function formatInvoiceComposition(composition: string | null | undefined): string {
  const raw = composition?.trim();
  if (!raw) return "—";
  return formatInvoiceFibreContent(raw) || "—";
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

/** Normalize article, garment_type, and description for stored/API invoice lines. */
export function normalizeInvoiceLine(line: CustomerInvoiceLine): CustomerInvoiceLine {
  const resolved = resolveInvoiceLineArticle(line);
  const pieceNames = pieceNamesFromInvoicePieceField(resolved.piece_name);
  const garmentType = resolveCombinedGarmentType(resolved.garment_type, pieceNames);
  return {
    ...resolved,
    garment_type: garmentType,
    description: resolveInvoiceGarmentDescription(resolved.garment_type, resolved.piece_name),
  };
}

export function resolveInvoiceLines(lines: CustomerInvoiceLine[]): CustomerInvoiceLine[] {
  return lines.map(normalizeInvoiceLine);
}

export type CustomerInvoiceLineDisplay = CustomerInvoiceLine & {
  article_label: string;
  composition_label: string;
};

export function toInvoiceLineDisplay(line: CustomerInvoiceLine): CustomerInvoiceLineDisplay {
  const resolved = normalizeInvoiceLine(line);
  const composition = resolveInvoiceComposition(resolved);
  return {
    ...resolved,
    composition,
    article_label: formatInvoiceArticle(resolved.article_number),
    composition_label: formatInvoiceCompositionLine(
      resolved.fabric_brand,
      composition,
      resolved.weight_gsm
    ),
  };
}

/**
 * Number of individual garment pieces in one line's garment type.
 * Combo sets count each piece (Shirt+Short = 2, Suit = Jacket+Trouser = 2),
 * single types count as 1. Prefers the explicit piece_name list, then falls
 * back to the garment-type piece definition in garment-types / label-codes.
 */
export function countGarmentPiecesForLine(
  line: Pick<CustomerInvoiceLine, "garment_type" | "piece_name">
): number {
  const pieceNames = pieceNamesFromInvoicePieceField(line.piece_name);
  if (pieceNames.length > 1) return pieceNames.length;
  const effectiveType = resolveCombinedGarmentType(line.garment_type, pieceNames);
  const pieceCount = getLabelCountForGarment(effectiveType);
  return pieceCount > 0 ? pieceCount : 1;
}

export interface InvoiceLineTotals {
  lineCount: number;
  /** Sum of raw line quantities (a combo set with qty 1 counts as 1). */
  totalQuantity: number;
  /** Sum of individual garment pieces × quantity across all lines. */
  totalGarmentItems: number;
}

/** Aggregate line counts for an invoice — combo lines expand into their pieces. */
export function computeInvoiceLineTotals(
  lines: Array<Pick<CustomerInvoiceLine, "garment_type" | "piece_name" | "quantity">>
): InvoiceLineTotals {
  let totalQuantity = 0;
  let totalGarmentItems = 0;
  for (const line of lines) {
    const qty = Number.isFinite(line.quantity) ? line.quantity : 0;
    totalQuantity += qty;
    totalGarmentItems += countGarmentPiecesForLine(line) * qty;
  }
  return { lineCount: lines.length, totalQuantity, totalGarmentItems };
}

export function sortInvoiceLinesByArticle(lines: CustomerInvoiceLine[]): CustomerInvoiceLine[] {
  return [...lines].sort((a, b) => {
    const artA = a.article_number ?? Number.MAX_SAFE_INTEGER;
    const artB = b.article_number ?? Number.MAX_SAFE_INTEGER;
    if (artA !== artB) return artA - artB;
    return a.id.localeCompare(b.id);
  });
}
