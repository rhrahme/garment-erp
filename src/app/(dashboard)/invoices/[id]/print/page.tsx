import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/invoicing/InvoiceDocument";
import { InvoicePrintToolbar } from "@/components/invoicing/InvoicePrintToolbar";
import { getCustomerInvoiceById } from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getSalesOrderById } from "@/lib/data/sales-orders";
import {
  enrichInvoiceDeliveryDestination,
  enrichInvoiceLinesWithCostHints,
  enrichInvoiceLinesWithFabricDetails,
} from "@/lib/invoicing/build-invoice";
import { resolveInvoiceLines, sortInvoiceLinesByArticle, toInvoiceLineDisplay } from "@/lib/invoicing/display";

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  await ensureDocumentsLoaded(["customer_invoices", "sales_orders"]);

  const { id } = await params;
  const raw = getCustomerInvoiceById(id);
  if (!raw) notFound();

  const order = getSalesOrderById(raw.sales_order_id);
  const invoice = enrichInvoiceDeliveryDestination(
    {
      ...raw,
      delivery_destination: raw.delivery_destination ?? null,
      lines: sortInvoiceLinesByArticle(
        resolveInvoiceLines(
          enrichInvoiceLinesWithCostHints(enrichInvoiceLinesWithFabricDetails(raw.lines, order), order)
        )
      ).map(toInvoiceLineDisplay),
    },
    order
  );

  return (
    <div className="min-h-screen bg-white text-slate-900 print:bg-white">
      <style>{`@media print { aside { display: none !important; } header { display: none !important; } main { margin: 0 !important; padding: 0 !important; } .no-print { display: none !important; } }`}</style>
      <InvoicePrintToolbar invoiceNumber={raw.invoice_number} />
      <InvoiceDocument invoice={invoice} />
    </div>
  );
}
