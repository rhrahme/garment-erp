import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceEditor } from "@/components/invoicing/InvoiceEditor";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCustomerInvoiceByIdFresh } from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getSalesOrderByIdFresh } from "@/lib/data/sales-orders";
import {
  enrichInvoiceDeliveryDestination,
  enrichInvoiceLinesWithCostHints,
  enrichInvoiceLinesWithFabricDetails,
} from "@/lib/invoicing/build-invoice";
import { formatInvoiceClientName, resolveInvoiceLines, sortInvoiceLinesByArticle } from "@/lib/invoicing/display";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await ensureDocumentsLoaded(["customer_invoices", "sales_orders"]);

  const { id } = await params;
  const raw = await getCustomerInvoiceByIdFresh(id);
  if (!raw) notFound();

  const order = await getSalesOrderByIdFresh(raw.sales_order_id);
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
      <InvoiceEditor
        key={`${invoice.id}-${invoice.subtotal}-${invoice.total}-${invoice.lines.map((l) => l.unit_price).join(",")}`}
        invoice={invoice}
      />
    </div>
  );
}
