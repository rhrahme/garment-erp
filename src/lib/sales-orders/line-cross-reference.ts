import type { FabricSwatchKey } from "@/lib/fabric-sourcing/fabric-swatch-keys";
import { resolveFabricSupplierId } from "@/lib/fabric-sourcing/supplier-aliases";
import type { CustomerInvoiceLine } from "@/lib/types/customer-invoices";
import type { PurchaseOrder, PurchaseOrderLine } from "@/lib/types/fabric-sourcing";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";
import {
  formatFabricLineArticle,
  lineArticleFromStickerCode,
  soArticleFromFabricLine,
  stickerCodeArticleSuffix,
} from "@/lib/sales-orders/label-codes";

export function findFabricLineForInvoiceLine(
  order: SalesOrder,
  invoiceLine: CustomerInvoiceLine
): SalesOrderFabricLine | undefined {
  if (invoiceLine.sales_order_line_id) {
    const byId = order.fabric_lines.find((line) => line.id === invoiceLine.sales_order_line_id);
    if (byId) return byId;
  }
  if (invoiceLine.sticker_code) {
    const bySticker = order.fabric_lines.find((line) =>
      line.label_stickers?.some((sticker) => sticker.code === invoiceLine.sticker_code)
    );
    if (bySticker) return bySticker;

    const invoiceArticle = lineArticleFromStickerCode(invoiceLine.sticker_code);
    if (invoiceArticle != null) {
      const byArticle = order.fabric_lines.find(
        (line) => soArticleFromFabricLine(line) === invoiceArticle
      );
      if (byArticle) return byArticle;
    }
  }

  if (invoiceLine.fabric_number) {
    const byFabric = order.fabric_lines.find((line) => line.fabric_number === invoiceLine.fabric_number);
    if (byFabric) return byFabric;
  }

  return order.fabric_lines.find(
    (line) =>
      line.garment_type === invoiceLine.garment_type &&
      (invoiceLine.piece_name == null ||
        line.label_stickers?.some((sticker) => sticker.piece_name === invoiceLine.piece_name))
  );
}

export function findFabricPoLineForSoFabricLine(
  fabricLine: SalesOrderFabricLine,
  fabricPos: PurchaseOrder[]
): { po: PurchaseOrder; poLine: PurchaseOrderLine } | null {
  const stickerCodes = new Set((fabricLine.label_stickers ?? []).map((sticker) => sticker.code));

  for (const po of fabricPos) {
    for (const poLine of po.lines ?? []) {
      const poStickers = poLine.label_stickers ?? [];
      if (poStickers.some((sticker) => stickerCodes.has(sticker.code))) {
        return { po, poLine };
      }
      if (
        poLine.fabric_number === fabricLine.fabric_number &&
        (poLine.garment_type == null || poLine.garment_type === fabricLine.garment_type)
      ) {
        return { po, poLine };
      }
    }
  }

  return null;
}

export interface InvoiceLineCrossRef {
  so_article_label: string | null;
  so_fabric_line_id: string | null;
  sticker_suffix: string | null;
  fabric_po_id: string | null;
  fabric_po_number: string | null;
}

export function buildInvoiceLineCrossRef(
  line: CustomerInvoiceLine,
  order: SalesOrder | undefined,
  fabricPos: PurchaseOrder[]
): InvoiceLineCrossRef {
  const fabricLine = order ? findFabricLineForInvoiceLine(order, line) : undefined;
  const stickerCode =
    line.sticker_code ?? fabricLine?.label_stickers?.find((s) => s.code)?.code ?? null;
  const soArticle = stickerCode ? lineArticleFromStickerCode(stickerCode) : null;
  const poMatch = fabricLine ? findFabricPoLineForSoFabricLine(fabricLine, fabricPos) : null;

  return {
    so_article_label: soArticle != null ? formatFabricLineArticle(soArticle) : null,
    so_fabric_line_id: fabricLine?.id ?? line.sales_order_line_id,
    sticker_suffix: stickerCode ? stickerCodeArticleSuffix(stickerCode) : null,
    fabric_po_id: poMatch?.po.id ?? null,
    fabric_po_number: poMatch?.po.po_number ?? null,
  };
}

export function buildInvoiceLineCrossRefs(
  lines: CustomerInvoiceLine[],
  order: SalesOrder | undefined,
  fabricPos: PurchaseOrder[]
): Map<string, InvoiceLineCrossRef> {
  return new Map(
    lines.map((line) => [line.id, buildInvoiceLineCrossRef(line, order, fabricPos)])
  );
}

/** Known invoice fabric_brand display labels → catalog supplier id (swatch fallback). */
const FABRIC_BRAND_TO_SUPPLIER_ID: Record<string, string> = {
  caccioppoli: "caccioppoli",
  canclini: "canclini",
  drapers: "drapers",
  gazaba: "gazaba",
  "loro piana": "loro-piana",
  solbiati: "solbiati",
  stylbiella: "stylbiella",
  "wool stock": "wool-stock",
  zegna: "zegna",
};

function resolveInvoiceLineSwatchKey(
  line: CustomerInvoiceLine,
  order: SalesOrder | undefined
): FabricSwatchKey | null {
  const fabricNumber = line.fabric_number?.trim();
  if (!fabricNumber) return null;

  const fabricLine = order ? findFabricLineForInvoiceLine(order, line) : undefined;
  if (fabricLine?.supplier_id) {
    return {
      supplier_id: resolveFabricSupplierId(fabricLine.supplier_id),
      fabric_number: fabricNumber,
    };
  }

  const brand = line.fabric_brand?.trim().toLowerCase();
  if (!brand) return null;
  const supplierId = FABRIC_BRAND_TO_SUPPLIER_ID[brand];
  if (!supplierId) return null;
  return { supplier_id: supplierId, fabric_number: fabricNumber };
}

/** Supplier + fabric number per invoice line — for editor swatch thumbnails only. */
export function buildInvoiceLineSwatchKeys(
  lines: CustomerInvoiceLine[],
  order: SalesOrder | undefined
): Map<string, FabricSwatchKey> {
  return new Map(
    lines
      .map((line) => {
        const key = resolveInvoiceLineSwatchKey(line, order);
        return key ? ([line.id, key] as const) : null;
      })
      .filter((entry): entry is [string, FabricSwatchKey] => entry != null)
  );
}

export function salesOrderFabricLineAnchor(lineId: string): string {
  return `fabric-line-${lineId}`;
}

export function supplierEmailsHref(salesOrderId: string, fabricPoId?: string | null): string {
  const params = new URLSearchParams({ sales_order_id: salesOrderId });
  if (fabricPoId) params.set("po_id", fabricPoId);
  return `/supplier-emails?${params.toString()}`;
}
