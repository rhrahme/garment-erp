import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceEditor } from "@/components/invoicing/InvoiceEditor";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCustomerInvoiceById } from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getSalesOrderById } from "@/lib/data/sales-orders";
import {
  enrichInvoiceDeliveryDestination,
  enrichInvoiceLinesWithCostHints,
  enrichInvoiceLinesWithFabricDetails,
} from "@/lib/invoicing/build-invoice";
import { formatInvoiceClientName, resolveInvoiceLines, sortInvoiceLinesByArticle } from "@/lib/invoicing/display";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
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
      ),
    },
    order
  );

  return (
    <div>
      <PageHeader
        title="Invoice"
        description={`${formatInvoiceClientName(invoice.client_name)} · ${invoice.so_number}`}
        action={
          <Link href="/invoices" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
            ← All invoices
          </Link>
        }
      />
      <InvoiceEditor invoice={invoice} />
    </div>
  );
}
