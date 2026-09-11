import { getCostingOverview, getSalesOrderCost } from "@/lib/costing/compute";
import {
  buildCostHintWorksheet,
  buildCostHintWorksheetFromInvoice,
  costHintFabricBasis,
  pieceCountForFabricLine,
  type CostHintFabricBasis,
  type CostHintWorksheet,
} from "@/lib/costing/cost-hint-worksheet";
import { getCustomerInvoiceById, readCustomerInvoices } from "@/lib/data/customer-invoices";
import { getSalesOrderById, getSalesOrdersByIds, readSalesOrders } from "@/lib/data/sales-orders";
import { invoiceSalesOrderIds } from "@/lib/invoicing/invoice-sales-orders";
import { enrichInvoiceLinesWithCostHints, enrichInvoiceLinesWithFabricDetails } from "@/lib/invoicing/build-invoice";
import { resolveInvoiceLines, sortInvoiceLinesByArticle } from "@/lib/invoicing/display";
import type { SalesOrder } from "@/lib/types/sales-orders";

/**
 * Cloth price and meters per fabric line, resolved through the costing layer so
 * the supplier catalog fallback applies. Most fabric lines store `unit_price: 0`
 * and the real price lives in the catalog.
 */
function fabricBasisByLineId(orders: SalesOrder[]): Map<string, CostHintFabricBasis> {
  const basis = new Map<string, CostHintFabricBasis>();
  for (const order of orders) {
    const pieceCountByLineId = new Map(
      order.fabric_lines.map((line) => [line.id, pieceCountForFabricLine(line)] as const)
    );
    for (const line of getSalesOrderCost(order).lines) {
      basis.set(
        line.line_id,
        costHintFabricBasis({
          unit_price: line.unit_price,
          supplier_id: line.supplier_id,
          meters: line.meters,
          unit: line.unit,
          pieces: pieceCountByLineId.get(line.line_id) ?? 1,
        })
      );
    }
  }
  return basis;
}

export function loadCostHintWorksheet(query: {
  invoiceId?: string | null;
  soNumber?: string | null;
  brandId?: string | null;
  includeArchived?: boolean;
  clientTokens?: string[];
}): CostHintWorksheet | null {
  if (query.invoiceId) {
    const invoice = getCustomerInvoiceById(query.invoiceId);
    if (!invoice) return null;
    const orders = getSalesOrdersByIds(invoiceSalesOrderIds(invoice));
    const order = orders[0] ?? getSalesOrderById(invoice.sales_order_id);
    const lines = sortInvoiceLinesByArticle(
      resolveInvoiceLines(enrichInvoiceLinesWithCostHints(enrichInvoiceLinesWithFabricDetails(invoice.lines, orders), orders))
    );
    const coveredOrders = orders.length > 0 ? orders : order ? [order] : [];
    return buildCostHintWorksheetFromInvoice({
      invoice: { ...invoice, lines },
      salesOrders: coveredOrders,
      fabricBasisByLineId: fabricBasisByLineId(coveredOrders),
    });
  }

  const namedClients = (query.clientTokens?.length ?? 0) > 0;
  return buildCostHintWorksheet({
    overview: getCostingOverview({ includeArchived: true, skipDedupe: namedClients }),
    salesOrders: readSalesOrders().orders,
    invoices: readCustomerInvoices().invoices,
    brandId: namedClients ? null : query.brandId,
    soNumber: query.soNumber,
    includeArchived: namedClients || query.includeArchived === true,
    clientTokens: query.clientTokens,
  });
}
