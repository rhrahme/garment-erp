import { getCostingOverview } from "@/lib/costing/compute";
import {
  buildCostHintWorksheet,
  buildCostHintWorksheetFromInvoice,
  type CostHintWorksheet,
} from "@/lib/costing/cost-hint-worksheet";
import { getCustomerInvoiceById, readCustomerInvoices } from "@/lib/data/customer-invoices";
import { getSalesOrderById, getSalesOrdersByIds, readSalesOrders } from "@/lib/data/sales-orders";
import { invoiceSalesOrderIds } from "@/lib/invoicing/invoice-sales-orders";
import { enrichInvoiceLinesWithCostHints, enrichInvoiceLinesWithFabricDetails } from "@/lib/invoicing/build-invoice";
import { resolveInvoiceLines, sortInvoiceLinesByArticle } from "@/lib/invoicing/display";

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
    return buildCostHintWorksheetFromInvoice({
      invoice: { ...invoice, lines },
      salesOrders: orders.length > 0 ? orders : order ? [order] : [],
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
