import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/invoicing/InvoiceDocument";
import { InvoicePrintToolbar } from "@/components/invoicing/InvoicePrintToolbar";
import { INVOICE_PRINT_CSS } from "@/lib/invoicing/print-styles";
import { prepareCustomerInvoiceDocument } from "@/lib/invoicing/prepare-invoice-document";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prepared = await prepareCustomerInvoiceDocument(id);
  if (!prepared) notFound();

  return (
    <div className="invoice-print-page min-h-screen bg-white p-8 text-slate-900 print:min-h-0 print:bg-white print:p-0">
      <style>{INVOICE_PRINT_CSS}</style>
      <InvoicePrintToolbar invoiceId={id} invoiceNumber={prepared.invoiceNumber} />
      <InvoiceDocument invoice={prepared.invoice} />
    </div>
  );
}
