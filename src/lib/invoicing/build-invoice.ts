import { getSalesOrderCost } from "@/lib/costing/compute";
import { formatClientDisplayName } from "@/lib/clients/names";
import { getClientById } from "@/lib/data/clients";
import { getFactoryBrandById } from "@/lib/data/factory-brands";
import { formatFabricSupplierName } from "@/lib/fabric-sourcing/supplier-display";
import { isReadyMadeSalesOrder } from "@/lib/data/sales-orders";
import { computeDueDate } from "@/lib/invoicing/pricing";
import {
  fabricLineArticleNumber,
  formatCombinedGarmentDescription,
  formatLabelGarmentDescription,
  getGarmentPieces,
  lineArticleFromStickerCode,
} from "@/lib/sales-orders/label-codes";
import { resolveInvoiceComposition } from "@/lib/invoicing/display";
import { applyAllInvoiceLineReductions } from "@/lib/invoicing/line-reduction-suggestions";
import { isCombinedInvoiceLine, pieceNamesFromLine } from "@/lib/invoicing/suit-combine-lines";
import { resolveInvoiceVatRate } from "@/lib/invoicing/vat";
import { findFabricLineForInvoiceLine } from "@/lib/sales-orders/line-cross-reference";
import type { CustomerInvoice, CustomerInvoiceLine } from "@/lib/types/customer-invoices";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function unitCostHintForFabricLine(
  fabricLine: SalesOrderFabricLine,
  lineTotalCost: number | null
): number | null {
  if (lineTotalCost == null) return null;
  const stickerCount = Math.max(fabricLine.label_stickers?.length ?? fabricLine.label_count, 1);
  return roundMoney(lineTotalCost / stickerCount);
}

function formatClientAddress(client: {
  address: string | null;
  city: string | null;
  country: string | null;
}): string | null {
  const parts = [client.address, client.city, client.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function orderedPieceNames(garmentType: string, pieceNames: string[]): string[] {
  const order = getGarmentPieces(garmentType);
  return [...pieceNames].sort((a, b) => {
    const indexA = order.indexOf(a);
    const indexB = order.indexOf(b);
    return (indexA === -1 ? order.length : indexA) - (indexB === -1 ? order.length : indexB);
  });
}

function lineDescription(garmentType: string, pieceName: string | null): string {
  const pieceNames = pieceNamesFromLine(pieceName);
  if (pieceNames.length > 1) return formatCombinedGarmentDescription(garmentType, pieceNames);
  return formatLabelGarmentDescription(garmentType, pieceName ?? garmentType);
}

export {
  applySuitCombine,
  combineInvoiceLines,
  invoiceLineGroupKey,
  suggestSuitCombineGroups,
  type SuitCombineGroup,
} from "@/lib/invoicing/suit-combine-lines";

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
      fabric_number: line.fabric_number ?? fabricLine.fabric_number,
      fabric_brand: line.fabric_brand ?? fabricBrandLabel(fabricLine),
      composition: resolveInvoiceComposition(line, fabricLine),
      weight_gsm: line.weight_gsm ?? fabricLine.weight_gsm,
    };
  });
}

/** Recompute internal cost hints from current sales order costing (incl. catalog price fallback). */
export function enrichInvoiceLinesWithCostHints(
  lines: CustomerInvoiceLine[],
  order: SalesOrder | undefined
): CustomerInvoiceLine[] {
  if (!order) return lines;

  const orderCost = getSalesOrderCost(order);
  const costByLineId = new Map(orderCost.lines.map((line) => [line.line_id, line.total_cost_sar]));
  const fabricCostByLineId = new Map(
    orderCost.lines.map((line) => [line.line_id, line.fabric_cost_sar])
  );

  return lines.map((line) => {
    const fabricLine = findFabricLineForInvoiceLine(order, line);
    if (!fabricLine) return line;
    const lineTotalCost = costByLineId.get(fabricLine.id) ?? null;
    const lineFabricCost = fabricCostByLineId.get(fabricLine.id) ?? null;
    const unitHint = isCombinedInvoiceLine(line)
      ? lineTotalCost
      : unitCostHintForFabricLine(fabricLine, lineTotalCost);
    const fabricUnitHint = isCombinedInvoiceLine(line)
      ? lineFabricCost
      : unitCostHintForFabricLine(fabricLine, lineFabricCost);
    if (unitHint == null && fabricUnitHint == null) return line;
    return {
      ...line,
      ...(unitHint != null ? { cost_hint_sar: unitHint } : {}),
      ...(fabricUnitHint != null ? { fabric_cost_hint_sar: fabricUnitHint } : {}),
    };
  });
}

export function buildInvoiceLinesFromSalesOrder(order: SalesOrder): CustomerInvoiceLine[] {
  const orderCost = getSalesOrderCost(order);
  const costByLineId = new Map(orderCost.lines.map((line) => [line.line_id, line.total_cost_sar]));
  const fabricCostByLineId = new Map(
    orderCost.lines.map((line) => [line.line_id, line.fabric_cost_sar])
  );

  const lines: CustomerInvoiceLine[] = [];
  let index = 0;

  for (const [fabricLineIndex, fabricLine] of order.fabric_lines.entries()) {
    const articleNumber = fabricLineArticleNumber(fabricLineIndex);
    const unitHint = unitCostHintForFabricLine(fabricLine, costByLineId.get(fabricLine.id) ?? null);
    const fabricUnitHint = unitCostHintForFabricLine(
      fabricLine,
      fabricCostByLineId.get(fabricLine.id) ?? null
    );

    const stickers =
      fabricLine.label_stickers?.length > 0
        ? fabricLine.label_stickers
        : Array.from({ length: fabricLine.label_count }, (_, i) => ({
            code: `${fabricLine.id}-L${String(i + 1).padStart(2, "0")}`,
            piece_name: fabricLine.garment_type,
            sequence: i + 1,
          }));

    const garmentPieces = getGarmentPieces(fabricLine.garment_type);
    if (garmentPieces.length > 1 && stickers.length > 1) {
      index += 1;
      const pieceNames = orderedPieceNames(
        fabricLine.garment_type,
        stickers.map((sticker) => sticker.piece_name)
      );
      const perPiecePrice = unitHint ?? 0;
      const setUnitPrice = roundMoney(perPiecePrice * stickers.length);
      const setCostHint = unitHint != null ? roundMoney(unitHint * stickers.length) : null;
      const setFabricCostHint =
        fabricUnitHint != null ? roundMoney(fabricUnitHint * stickers.length) : null;
      lines.push({
        id: `inv-line-${order.id}-${index}`,
        article_number: articleNumber,
        sales_order_line_id: fabricLine.id,
        description: formatCombinedGarmentDescription(fabricLine.garment_type, pieceNames),
        garment_type: fabricLine.garment_type,
        piece_name: pieceNames.join(" + "),
        sticker_code: stickers[0]!.code,
        fabric_number: fabricLine.fabric_number,
        fabric_brand: fabricBrandLabel(fabricLine),
        composition: fabricLine.composition,
        weight_gsm: fabricLine.weight_gsm,
        quantity: 1,
        unit_price: setUnitPrice,
        line_total: setUnitPrice,
        cost_hint_sar: setCostHint,
        fabric_cost_hint_sar: setFabricCostHint,
      });
      continue;
    }

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
        fabric_cost_hint_sar: fabricUnitHint,
      });
    }
  }

  return lines;
}

export function recalculateInvoiceTotals(
  lines: CustomerInvoiceLine[],
  vatRate?: number | null
): {
  lines: CustomerInvoiceLine[];
  subtotal: number;
  vat_amount: number;
  total: number;
} {
  const normalized = lines.map((line) => {
    const lineTotal = roundMoney(line.quantity * line.unit_price);
    return { ...line, line_total: lineTotal };
  });
  const subtotal = roundMoney(normalized.reduce((sum, line) => sum + line.line_total, 0));
  const rate = vatRate != null && vatRate > 0 ? vatRate : 0;
  const vat_amount = rate > 0 ? roundMoney(subtotal * rate) : 0;
  const total = roundMoney(subtotal + vat_amount);
  return { lines: normalized, subtotal, vat_amount, total };
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
  const lines = applyAllInvoiceLineReductions(buildInvoiceLinesFromSalesOrder(order));
  const vat_rate = resolveInvoiceVatRate(order.delivery_destination);
  const { lines: pricedLines, subtotal, vat_amount, total } = recalculateInvoiceTotals(lines, vat_rate);
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
    vat_rate,
    vat_amount,
    total,
    notes: null,
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

/** Apply Saudi VAT (15% on subtotal) when delivery destination is RUH; recalculate totals. */
export function enrichInvoiceVat<T extends CustomerInvoice>(invoice: T): T {
  const vat_rate = resolveInvoiceVatRate(invoice.delivery_destination);
  const { lines, subtotal, vat_amount, total } = recalculateInvoiceTotals(invoice.lines, vat_rate);
  return { ...invoice, lines, subtotal, vat_rate, vat_amount, total };
}
