import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/invoicing/InvoiceDocument";
import { InvoicePrintToolbar } from "@/components/invoicing/InvoicePrintToolbar";
import { INVOICE_PRINT_CSS } from "@/lib/invoicing/print-styles";
import { prepareCustomerInvoiceDocument } from "@/lib/invoicing/prepare-invoice-document";
import { getSessionContext } from "@/lib/auth/session";
import { getSalesOrderByIdFresh } from "@/lib/data/sales-orders";
import { canAccessSalesOrder } from "@/lib/sales/access";
import { getCustomerInvoiceByIdFresh } from "@/lib/data/customer-invoices";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prepared = await prepareCustomerInvoiceDocument(id);
  if (!prepared) notFound();
  const session = await getSessionContext();
  const rawInvoice = await getCustomerInvoiceByIdFresh(id);
  const order = rawInvoice ? await getSalesOrderByIdFresh(rawInvoice.sales_order_id) : null;
  if (!order || !canAccessSalesOrder(session, order)) notFound();

  return (
    <div className="invoice-print-page min-h-screen bg-white p-8 text-slate-900 print:min-h-0 print:bg-white print:p-0">
      <style>{INVOICE_PRINT_CSS}</style>
      <InvoicePrintToolbar invoiceId={id} invoiceNumber={prepared.invoiceNumber} />
      <InvoiceDocument invoice={prepared.invoice} />
    </div>
  );
}
