import { getSalesOrderCost } from "@/lib/costing/compute";
import { formatClientDisplayName } from "@/lib/clients/names";
import { getClientById } from "@/lib/data/clients";
import { getFactoryBrandById } from "@/lib/data/factory-brands";
import { formatFabricSupplierName } from "@/lib/fabric-sourcing/supplier-display";
import { isReadyMadeSalesOrder } from "@/lib/data/sales-orders";
import { computeDueDate } from "@/lib/invoicing/pricing";
import {
  fabricLineArticleNumber,
  formatLabelGarmentDescription,
  lineArticleFromStickerCode,
} from "@/lib/sales-orders/label-codes";
import type { CustomerInvoice, CustomerInvoiceLine } from "@/lib/types/customer-invoices";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function formatClientAddress(client: {
  address: string | null;
  city: string | null;
  country: string | null;
}): string | null {
  const parts = [client.address, client.city, client.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function lineDescription(garmentType: string, pieceName: string | null): string {
  return formatLabelGarmentDescription(garmentType, pieceName ?? garmentType);
}

function fabricBrandLabel(line: SalesOrderFabricLine): string {
  return formatFabricSupplierName(line.supplier_id, line.supplier_name, line.fabric_number);
}

function articleNumberForFabricLine(order: SalesOrder, fabricLine: SalesOrderFabricLine): number {
  const index = order.fabric_lines.findIndex((line) => line.id === fabricLine.id);
  return fabricLineArticleNumber(index >= 0 ? index : 0);
}

function resolveArticleNumber(
  order: SalesOrder,
  invoiceLine: CustomerInvoiceLine,
  fabricLine: SalesOrderFabricLine | undefined
): number | null {
  if (invoiceLine.article_number != null) return invoiceLine.article_number;
  if (fabricLine) return articleNumberForFabricLine(order, fabricLine);
  if (invoiceLine.sticker_code) {
    const fromSticker = lineArticleFromStickerCode(invoiceLine.sticker_code);
    if (fromSticker != null) return fromSticker;
  }
  return null;
}

function findFabricLineForInvoiceLine(
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

export function enrichInvoiceLinesWithFabricDetails(
  lines: CustomerInvoiceLine[],
  order: SalesOrder | undefined
): CustomerInvoiceLine[] {
  if (!order) return lines;

  return lines.map((line) => {
    const fabricLine = findFabricLineForInvoiceLine(order, line);
    if (!fabricLine) return line;

    const pieceName =
      line.piece_name ??
      fabricLine.label_stickers?.find((sticker) => sticker.code === line.sticker_code)?.piece_name ??
      null;

    return {
      ...line,
      piece_name: pieceName,
      description: lineDescription(fabricLine.garment_type, pieceName),
      fabric_brand: line.fabric_brand ?? fabricBrandLabel(fabricLine),
      composition: line.composition ?? fabricLine.composition,
      weight_gsm: line.weight_gsm ?? fabricLine.weight_gsm,
    };
  });
}

export function buildInvoiceLinesFromSalesOrder(order: SalesOrder): CustomerInvoiceLine[] {
  const orderCost = getSalesOrderCost(order);
  const costByLineId = new Map(orderCost.lines.map((line) => [line.line_id, line.total_cost_sar]));

  const lines: CustomerInvoiceLine[] = [];
  let index = 0;

  for (const [fabricLineIndex, fabricLine] of order.fabric_lines.entries()) {
    const articleNumber = fabricLineArticleNumber(fabricLineIndex);
    const lineTotalCost = costByLineId.get(fabricLine.id) ?? null;
    const stickerCount = Math.max(fabricLine.label_stickers?.length ?? fabricLine.label_count, 1);
    const unitHint =
      lineTotalCost != null && stickerCount > 0 ? roundMoney(lineTotalCost / stickerCount) : null;

    const stickers =
      fabricLine.label_stickers?.length > 0
        ? fabricLine.label_stickers
        : Array.from({ length: fabricLine.label_count }, (_, i) => ({
            code: `${fabricLine.id}-L${String(i + 1).padStart(2, "0")}`,
            piece_name: fabricLine.garment_type,
            sequence: i + 1,
          }));

    for (const sticker of stickers) {
      index += 1;
      const unitPrice = unitHint ?? 0;
      lines.push({
        id: `inv-line-${order.id}-${index}`,
        article_number: articleNumber,
        sales_order_line_id: fabricLine.id,
        description: lineDescription(fabricLine.garment_type, sticker.piece_name),
        garment_type: fabricLine.garment_type,
        piece_name: sticker.piece_name,
        sticker_code: sticker.code,
        fabric_number: fabricLine.fabric_number,
        fabric_brand: fabricBrandLabel(fabricLine),
        composition: fabricLine.composition,
        weight_gsm: fabricLine.weight_gsm,
        quantity: 1,
        unit_price: unitPrice,
        line_total: unitPrice,
        cost_hint_sar: unitHint,
      });
    }
  }

  return lines;
}

export function recalculateInvoiceTotals(lines: CustomerInvoiceLine[]): {
  lines: CustomerInvoiceLine[];
  subtotal: number;
  total: number;
} {
  const normalized = lines.map((line) => {
    const lineTotal = roundMoney(line.quantity * line.unit_price);
    return { ...line, line_total: lineTotal };
  });
  const subtotal = roundMoney(normalized.reduce((sum, line) => sum + line.line_total, 0));
  return { lines: normalized, subtotal, total: subtotal };
}

export function buildDraftInvoiceFromSalesOrder(
  order: SalesOrder,
  invoiceNumber: string,
  invoiceId: string
): CustomerInvoice {
  if (isReadyMadeSalesOrder(order)) {
    throw new Error("Ready-made batches are invoiced separately — not from bespoke sales orders.");
  }

  const client = getClientById(order.client_id);
  const lines = buildInvoiceLinesFromSalesOrder(order);
  const { lines: pricedLines, subtotal, total } = recalculateInvoiceTotals(lines);
  const orderCost = getSalesOrderCost(order);
  const today = new Date().toISOString().slice(0, 10);
  const paymentTerms = client?.payment_terms ?? null;
  const primaryBrandId = client?.brand_ids[0] ?? null;
  const factoryBrand = primaryBrandId ? getFactoryBrandById(primaryBrandId) : undefined;

  return {
    id: invoiceId,
    invoice_number: invoiceNumber,
    sales_order_id: order.id,
    so_number: order.so_number,
    client_id: order.client_id,
    client_code: order.client_code,
    client_name: client ? formatClientDisplayName(client) : order.client_name,
    client_reference: order.client_reference,
    client_email: client?.email ?? null,
    client_address: client ? formatClientAddress(client) : null,
    payment_terms: paymentTerms,
    currency: "SAR",
    status: "draft",
    invoice_date: today,
    due_date: computeDueDate(today, paymentTerms),
    lines: pricedLines,
    subtotal,
    total,
    notes: order.notes,
    created_at: new Date().toISOString(),
    sent_at: null,
    paid_at: null,
    factory_brand_name: factoryBrand?.name ?? null,
    total_cost_sar: orderCost.total_cost_sar,
    delivery_destination: order.delivery_destination,
  };
}

export function enrichInvoiceDeliveryDestination<T extends CustomerInvoice>(
  invoice: T,
  order: SalesOrder | undefined
): T {
  if (invoice.delivery_destination) return invoice;
  if (!order?.delivery_destination) return { ...invoice, delivery_destination: null };
  return { ...invoice, delivery_destination: order.delivery_destination };
}
