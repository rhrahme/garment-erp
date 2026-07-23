import { getCustomerInvoiceByIdFresh } from "@/lib/data/customer-invoices";
import { getSalesOrderByIdFresh } from "@/lib/data/sales-orders";
import {
  enrichInvoiceDeliveryDestination,
  enrichInvoiceLinesWithFabricDetails,
  enrichInvoiceVat,
} from "@/lib/invoicing/build-invoice";
import type { InvoiceDocumentData } from "@/components/invoicing/InvoiceDocument";
import { resolveInvoiceLines, sortInvoiceLinesByArticle, toInvoiceLineDisplay } from "@/lib/invoicing/display";
import { getInvoiceAmountPaid, getInvoiceBalanceDue } from "@/lib/invoicing/payments";

/** Load invoice + sales order and shape data for InvoiceDocument / PDF output. */
export async function prepareCustomerInvoiceDocument(
  invoiceId: string,
  options?: { kind?: "invoice" | "quote" }
): Promise<{ invoice: InvoiceDocumentData; invoiceNumber: string; filename: string } | null> {
  const raw = await getCustomerInvoiceByIdFresh(invoiceId);
  if (!raw) return null;

  const order = await getSalesOrderByIdFresh(raw.sales_order_id);
  const enriched = enrichInvoiceVat(
    enrichInvoiceDeliveryDestination(
      {
        ...raw,
        delivery_destination: raw.delivery_destination ?? null,
        lines: sortInvoiceLinesByArticle(
          resolveInvoiceLines(enrichInvoiceLinesWithFabricDetails(raw.lines, order))
        ).map(toInvoiceLineDisplay),
      },
      order
    )
  );

  const documentKind =
    options?.kind ?? (raw.status === "draft" ? "quote" : "invoice");
  const paymentBasis = { ...raw, total: enriched.total };
  const amountPaid = getInvoiceAmountPaid(paymentBasis);
  const balanceDue = getInvoiceBalanceDue(paymentBasis);

  const invoice: InvoiceDocumentData = {
    invoice_number: enriched.invoice_number,
    invoice_date: enriched.invoice_date,
    due_date: enriched.due_date,
    client_name: enriched.client_name,
    client_code: enriched.client_code,
    client_email: enriched.client_email,
    client_address: enriched.client_address,
    so_number: enriched.so_number,
    client_reference: enriched.client_reference,
    payment_terms: enriched.payment_terms,
    currency: enriched.currency,
    subtotal: enriched.subtotal,
    vat_rate: enriched.vat_rate,
    vat_amount: enriched.vat_amount,
    total: enriched.total,
    amount_paid: amountPaid,
    balance_due: balanceDue,
    document_kind: documentKind,
    factory_brand_name: enriched.factory_brand_name,
    delivery_destination: enriched.delivery_destination,
    lines: enriched.lines as InvoiceDocumentData["lines"],
  };

  const filenamePrefix = documentKind === "quote" ? "QUOTE" : "INV";
  const filename = `${filenamePrefix}-${raw.invoice_number}.pdf`;

  return { invoice, invoiceNumber: raw.invoice_number, filename };
}
