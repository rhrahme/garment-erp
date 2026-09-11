import { getSalesOrderCost } from "@/lib/costing/compute";
import { formatClientDisplayName } from "@/lib/clients/names";
import { getClientById } from "@/lib/data/clients";
import { getFactoryBrandById } from "@/lib/data/factory-brands";
import { resolveFabricItemFromCatalog } from "@/lib/fabric-sourcing/resolve-fabric-from-catalog";
import { formatFabricSupplierName } from "@/lib/fabric-sourcing/supplier-display";
import { isReadyMadeSalesOrder } from "@/lib/data/sales-orders";
import { oldestCalendarDate, withOldestCoveredInvoiceDate } from "@/lib/invoicing/invoice-dates";
import { computeDueDate } from "@/lib/invoicing/pricing";
import {
  fabricLineArticleNumber,
  formatCombinedGarmentDescription,
  getGarmentPieces,
  pieceNamesFromInvoicePieceField,
  resolveCombinedGarmentType,
  resolveInvoiceGarmentDescription,
  lineArticleFromStickerCode,
} from "@/lib/sales-orders/label-codes";
import { resolveInvoiceComposition, sortInvoiceLinesByArticle } from "@/lib/invoicing/display";
import { applyAllInvoiceLineReductions } from "@/lib/invoicing/line-reduction-suggestions";
import { asSalesOrderList, withInvoiceSalesOrders } from "@/lib/invoicing/invoice-sales-orders";
import { isCombinedInvoiceLine } from "@/lib/invoicing/suit-combine-lines";
import { resolveInvoiceVatRate } from "@/lib/invoicing/vat";
import { renumberInvoiceArticles } from "@/lib/invoicing/consolidate-lines";
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
  return resolveInvoiceGarmentDescription(garmentType, pieceName);
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
  order: SalesOrder | SalesOrder[] | undefined
): CustomerInvoiceLine[] {
  const orders = asSalesOrderList(order);
  if (orders.length === 0) return lines;

  return lines.map((line) => {
    const fabricLine = orders
      .map((row) => findFabricLineForInvoiceLine(row, line))
      .find((row): row is NonNullable<typeof row> => Boolean(row));
    if (!fabricLine) return line;

    const pieceName =
      line.piece_name ??
      fabricLine.label_stickers?.find((sticker) => sticker.code === line.sticker_code)?.piece_name ??
      null;
    const pieceNames = pieceNamesFromInvoicePieceField(pieceName);
    const garmentType = resolveCombinedGarmentType(
      line.garment_type ?? fabricLine.garment_type,
      pieceNames
    );

    const composition = resolveInvoiceComposition(line, fabricLine);
    const weightGsm = line.weight_gsm ?? fabricLine.weight_gsm;

    // Lines whose fabric was never matched to the catalog stored no fibre and no
    // weight. Left blank they all look alike, and articles that share nothing but
    // their emptiness merge into one row. Fill the gaps from the mill's own price
    // list; anything already on the line wins.
    const catalog =
      composition == null || weightGsm == null
        ? resolveFabricItemFromCatalog(fabricLine.supplier_id, fabricLine.fabric_number)
        : null;

    return {
      ...line,
      piece_name: pieceName,
      garment_type: garmentType,
      description: lineDescription(fabricLine.garment_type, pieceName),
      fabric_number: line.fabric_number ?? fabricLine.fabric_number,
      fabric_brand: line.fabric_brand ?? fabricBrandLabel(fabricLine),
      composition: composition ?? catalog?.composition ?? null,
      weight_gsm: weightGsm ?? catalog?.weight_gsm ?? null,
    };
  });
}

/** Recompute internal cost hints from current sales order costing (incl. catalog price fallback). */
export function enrichInvoiceLinesWithCostHints(
  lines: CustomerInvoiceLine[],
  order: SalesOrder | SalesOrder[] | undefined
): CustomerInvoiceLine[] {
  const orders = asSalesOrderList(order);
  if (orders.length === 0) return lines;

  const costByLineId = new Map<string, number | null>();
  const fabricCostByLineId = new Map<string, number | null>();
  for (const row of orders) {
    const orderCost = getSalesOrderCost(row);
    for (const costLine of orderCost.lines) {
      costByLineId.set(costLine.line_id, costLine.total_cost_sar);
      fabricCostByLineId.set(costLine.line_id, costLine.fabric_cost_sar);
    }
  }

  return lines.map((line) => {
    const fabricLine = orders
      .map((row) => findFabricLineForInvoiceLine(row, line))
      .find((row): row is NonNullable<typeof row> => Boolean(row));
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

/**
 * Fibre and weight for a fabric line, topped up from the mill's price list.
 *
 * Fabric numbers that never matched the catalog stored nothing at all. Blank
 * lines are indistinguishable from each other, so articles sharing only their
 * emptiness merged into a single row. Whatever the line already holds wins;
 * this only fills the gaps, and leaves them blank when the catalog has no entry
 * rather than inventing a spec.
 */
function fabricSpecForLine(fabricLine: SalesOrderFabricLine): {
  composition: string | null;
  weight_gsm: number | null;
} {
  const composition = fabricLine.composition;
  const weight_gsm = fabricLine.weight_gsm;
  if (composition != null && weight_gsm != null) return { composition, weight_gsm };

  const catalog = resolveFabricItemFromCatalog(fabricLine.supplier_id, fabricLine.fabric_number);
  return {
    composition: composition ?? catalog.composition ?? null,
    weight_gsm: weight_gsm ?? catalog.weight_gsm ?? null,
  };
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

    const fabricSpec = fabricSpecForLine(fabricLine);
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
        description: formatCombinedGarmentDescription(
          resolveCombinedGarmentType(fabricLine.garment_type, pieceNames),
          pieceNames
        ),
        garment_type: resolveCombinedGarmentType(fabricLine.garment_type, pieceNames),
        piece_name: pieceNames.join(" + "),
        sticker_code: stickers[0]!.code,
        fabric_number: fabricLine.fabric_number,
        fabric_brand: fabricBrandLabel(fabricLine),
        composition: fabricSpec.composition,
        weight_gsm: fabricSpec.weight_gsm,
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
        composition: fabricSpec.composition,
        weight_gsm: fabricSpec.weight_gsm,
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
    payments: [],
    factory_brand_name: factoryBrand?.name ?? null,
    total_cost_sar: orderCost.total_cost_sar,
    delivery_destination: order.delivery_destination,
  };
}

export function buildDraftInvoiceFromSalesOrders(
  orders: SalesOrder[],
  invoiceNumber: string,
  invoiceId: string
): CustomerInvoice {
  const unique = [
    ...new Map(orders.map((order) => [order.id, order])).values(),
  ].sort((a, b) => a.so_number.localeCompare(b.so_number));
  if (unique.length === 0) {
    throw new Error("Select at least one sales order.");
  }
  if (unique.length === 1) {
    return buildDraftInvoiceFromSalesOrder(unique[0]!, invoiceNumber, invoiceId);
  }

  const clientIds = new Set(unique.map((order) => order.client_id));
  if (clientIds.size > 1) {
    throw new Error("Sales orders must belong to the same client.");
  }
  if (unique.some((order) => isReadyMadeSalesOrder(order))) {
    throw new Error("Ready-made batches are invoiced separately - not from bespoke sales orders.");
  }

  const lines = applyAllInvoiceLineReductions(
    unique.flatMap((order) => buildInvoiceLinesFromSalesOrder(order))
  );
  const first = buildDraftInvoiceFromSalesOrder(unique[0]!, invoiceNumber, invoiceId);
  const vat_rate = resolveInvoiceVatRate(unique[0]!.delivery_destination);
  const { lines: pricedLines, subtotal, vat_amount, total } = recalculateInvoiceTotals(
    renumberInvoiceArticles(lines),
    vat_rate
  );
  const totalCost = unique.reduce((sum, order) => {
    const cost = getSalesOrderCost(order).total_cost_sar;
    return cost != null ? sum + cost : sum;
  }, 0);

  const oldestOrderDate =
    oldestCalendarDate(...unique.map((order) => order.order_date)) ?? first.invoice_date;

  return withInvoiceSalesOrders(
    {
      ...first,
      invoice_date: oldestOrderDate,
      due_date: computeDueDate(oldestOrderDate, first.payment_terms),
      lines: pricedLines,
      subtotal,
      vat_amount,
      total,
      total_cost_sar: totalCost || first.total_cost_sar,
    },
    unique.map((order) => ({ id: order.id, so_number: order.so_number }))
  );
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

/**
 * Append invoice lines for sales-order articles missing on a stored invoice.
 * Preserves entered unit prices on existing lines; new lines use built defaults (often 0).
 * Skips built lines whose sales-order fabric line is already linked on the invoice.
 */
export function syncInvoiceLinesFromSalesOrder(
  invoice: CustomerInvoice,
  order: SalesOrder
): CustomerInvoice {
  const built = applyAllInvoiceLineReductions(
    enrichInvoiceLinesWithCostHints(buildInvoiceLinesFromSalesOrder(order), order)
  );
  const existingByArticle = new Map(
    invoice.lines
      .filter((line) => line.article_number != null)
      .map((line) => [line.article_number!, line])
  );
  const coveredSalesOrderLineIds = new Set(
    invoice.lines.map((line) => line.sales_order_line_id).filter((id): id is string => Boolean(id))
  );
  const invoiceCreatedAt = invoice.created_at ? Date.parse(invoice.created_at) : 0;

  const merged: CustomerInvoiceLine[] = [];
  const seenArticles = new Set<number>();

  for (const builtLine of built) {
    const article = builtLine.article_number;
    if (article == null) continue;
    seenArticles.add(article);
    const existing = existingByArticle.get(article);
    if (existing) {
      merged.push({
        ...builtLine,
        ...existing,
        id: existing.id,
        unit_price: existing.unit_price,
        quantity: existing.quantity,
        line_total: roundMoney(existing.quantity * existing.unit_price),
        cost_hint_sar: builtLine.cost_hint_sar ?? existing.cost_hint_sar,
        fabric_cost_hint_sar: builtLine.fabric_cost_hint_sar ?? existing.fabric_cost_hint_sar,
      });
      continue;
    }

    const fabricLineId = builtLine.sales_order_line_id?.trim();
    if (fabricLineId && coveredSalesOrderLineIds.has(fabricLineId)) continue;

    const fabricLine = findFabricLineForInvoiceLine(order, builtLine);
    if (fabricLine?.added_at && invoiceCreatedAt > 0) {
      const addedAt = Date.parse(fabricLine.added_at);
      if (!Number.isNaN(addedAt) && addedAt <= invoiceCreatedAt) continue;
    }

    merged.push(builtLine);
    if (fabricLineId) coveredSalesOrderLineIds.add(fabricLineId);
  }

  for (const line of invoice.lines) {
    if (line.article_number != null && !seenArticles.has(line.article_number)) {
      merged.push(line);
    }
  }

  const lines = sortInvoiceLinesByArticle(merged);
  const vat_rate = invoice.vat_rate ?? resolveInvoiceVatRate(invoice.delivery_destination);
  const { lines: pricedLines, subtotal, vat_amount, total } = recalculateInvoiceTotals(lines, vat_rate);
  const orderCost = getSalesOrderCost(order);

  return {
    ...invoice,
    lines: pricedLines,
    subtotal,
    vat_rate,
    vat_amount,
    total,
    total_cost_sar: orderCost.total_cost_sar,
  };
}

/**
 * Discard every stored line and regenerate from the covered orders.
 *
 * Unlike the sync above this keeps nothing: prices, quantities and merged rows
 * written by an earlier build are thrown away. Use it when the stored lines are
 * known to be wrong, not to pick up newly added articles.
 */
export function rebuildInvoiceLinesFromSalesOrders(
  invoice: CustomerInvoice,
  orders: SalesOrder[]
): CustomerInvoice {
  const unique = [...new Map(orders.map((order) => [order.id, order])).values()].sort((a, b) =>
    a.so_number.localeCompare(b.so_number)
  );
  if (unique.length === 0) return invoice;

  const built = renumberInvoiceArticles(
    applyAllInvoiceLineReductions(unique.flatMap((order) => buildInvoiceLinesFromSalesOrder(order)))
  );
  const vat_rate = invoice.vat_rate ?? resolveInvoiceVatRate(invoice.delivery_destination);
  const { lines, subtotal, vat_amount, total } = recalculateInvoiceTotals(built, vat_rate);
  const totalCost = unique.reduce((sum, order) => {
    const cost = getSalesOrderCost(order).total_cost_sar;
    return cost != null ? sum + cost : sum;
  }, 0);

  return withOldestCoveredInvoiceDate(
    withInvoiceSalesOrders(
      {
        ...invoice,
        lines,
        subtotal,
        vat_rate,
        vat_amount,
        total,
        total_cost_sar: totalCost || invoice.total_cost_sar,
      },
      unique.map((order) => ({ id: order.id, so_number: order.so_number }))
    ),
    unique.map((order) => order.order_date)
  );
}

export function syncInvoiceLinesFromSalesOrders(
  invoice: CustomerInvoice,
  orders: SalesOrder[]
): CustomerInvoice {
  const unique = [...new Map(orders.map((order) => [order.id, order])).values()];
  if (unique.length === 0) return invoice;
  let current = invoice;
  for (const order of unique) {
    current = syncInvoiceLinesFromSalesOrder(current, order);
  }
  const reduced = renumberInvoiceArticles(applyAllInvoiceLineReductions(current.lines));
  const vat_rate = current.vat_rate ?? resolveInvoiceVatRate(current.delivery_destination);
  const { lines: pricedLines, subtotal, vat_amount, total } = recalculateInvoiceTotals(
    reduced,
    vat_rate
  );
  const totalCost = unique.reduce((sum, order) => {
    const cost = getSalesOrderCost(order).total_cost_sar;
    return cost != null ? sum + cost : sum;
  }, 0);
  return withOldestCoveredInvoiceDate(
    withInvoiceSalesOrders(
      {
        ...current,
        lines: pricedLines,
        subtotal,
        vat_rate,
        vat_amount,
        total,
        total_cost_sar: totalCost || current.total_cost_sar,
      },
      unique.map((order) => ({ id: order.id, so_number: order.so_number }))
    ),
    unique.map((order) => order.order_date)
  );
}
