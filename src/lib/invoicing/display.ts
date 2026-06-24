import {
  clientCodeFromReference,
  formatCombinedGarmentDescription,
  getGarmentPieces,
  lineArticleFromStickerCode,
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

export function formatInvoiceComposition(composition: string | null | undefined): string {
  return composition?.trim() || "—";
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
  const pieceName = line.piece_name?.trim();
  if (pieceName?.includes(" + ") && getGarmentPieces(line.garment_type).length > 1) {
    return formatCombinedGarmentDescription(
      line.garment_type,
      pieceName.split(" + ").map((name) => name.trim())
    );
  }
  return line.description;
}

export function resolveInvoiceLines(lines: CustomerInvoiceLine[]): CustomerInvoiceLine[] {
  return lines.map(resolveInvoiceLineArticle);
}

export type CustomerInvoiceLineDisplay = CustomerInvoiceLine & {
  article_label: string;
  fabric_brand_label: string;
  composition_label: string;
  weight_label: string;
};

export function toInvoiceLineDisplay(line: CustomerInvoiceLine): CustomerInvoiceLineDisplay {
  const resolved = resolveInvoiceLineArticle(line);
  return {
    ...resolved,
    description: resolveInvoiceLineDescription(resolved),
    article_label: formatInvoiceArticle(resolved.article_number),
    fabric_brand_label: formatInvoiceFabricBrand(resolved.fabric_brand, resolved.fabric_number),
    composition_label: formatInvoiceComposition(resolved.composition),
    weight_label: formatInvoiceWeight(resolved.weight_gsm),
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
