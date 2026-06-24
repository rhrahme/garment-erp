import { getCustomerInvoiceByIdFresh } from "@/lib/data/customer-invoices";
import { getSalesOrderByIdFresh } from "@/lib/data/sales-orders";
import {
  enrichInvoiceDeliveryDestination,
  enrichInvoiceLinesWithFabricDetails,
} from "@/lib/invoicing/build-invoice";
import type { InvoiceDocumentData } from "@/components/invoicing/InvoiceDocument";
import { resolveInvoiceLines, sortInvoiceLinesByArticle, toInvoiceLineDisplay } from "@/lib/invoicing/display";

/** Load invoice + sales order and shape data for InvoiceDocument / PDF output. */
export async function prepareCustomerInvoiceDocument(
  invoiceId: string
): Promise<{ invoice: InvoiceDocumentData; invoiceNumber: string } | null> {
  const raw = await getCustomerInvoiceByIdFresh(invoiceId);
  if (!raw) return null;

  const order = await getSalesOrderByIdFresh(raw.sales_order_id);
  const invoice = enrichInvoiceDeliveryDestination(
    {
      ...raw,
      delivery_destination: raw.delivery_destination ?? null,
      lines: sortInvoiceLinesByArticle(
        resolveInvoiceLines(enrichInvoiceLinesWithFabricDetails(raw.lines, order))
      ).map(toInvoiceLineDisplay),
    },
    order
  );

  return { invoice, invoiceNumber: raw.invoice_number };
}
