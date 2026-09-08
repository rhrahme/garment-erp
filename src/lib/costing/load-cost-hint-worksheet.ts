import { getCostingOverview } from "@/lib/costing/compute";
import {
  buildCostHintWorksheet,
  buildCostHintWorksheetFromInvoice,
  type CostHintWorksheet,
} from "@/lib/costing/cost-hint-worksheet";
import { getCustomerInvoiceById, readCustomerInvoices } from "@/lib/data/customer-invoices";
import { getSalesOrderById, readSalesOrders } from "@/lib/data/sales-orders";
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
    const order = getSalesOrderById(invoice.sales_order_id);
    const lines = sortInvoiceLinesByArticle(
      resolveInvoiceLines(enrichInvoiceLinesWithCostHints(enrichInvoiceLinesWithFabricDetails(invoice.lines, order), order))
    );
    return buildCostHintWorksheetFromInvoice({
      invoice: { ...invoice, lines },
      salesOrder: order,
    });
  }

  return buildCostHintWorksheet({
    overview: getCostingOverview({ includeArchived: true }),
    salesOrders: readSalesOrders().orders,
    invoices: readCustomerInvoices().invoices,
    brandId: query.brandId,
    soNumber: query.soNumber,
    includeArchived: query.includeArchived === true,
    clientTokens: query.clientTokens,
  });
}
