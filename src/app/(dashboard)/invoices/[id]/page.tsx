import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceEditor } from "@/components/invoicing/InvoiceEditor";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCustomerInvoiceByIdFresh } from "@/lib/data/customer-invoices";
import { getSalesOrderByIdFresh } from "@/lib/data/sales-orders";
import { ensureFabricOrdersLoaded, listStoredFabricOrders } from "@/lib/integrations/fabric-order-store";
import {
  enrichInvoiceDeliveryDestination,
  enrichInvoiceLinesWithCostHints,
  enrichInvoiceLinesWithFabricDetails,
  enrichInvoiceVat,
} from "@/lib/invoicing/build-invoice";
import { formatInvoiceClientName, resolveInvoiceLines, sortInvoiceLinesByArticle } from "@/lib/invoicing/display";
import { buildInvoiceLineCrossRefs, buildInvoiceLineSwatchKeys } from "@/lib/sales-orders/line-cross-reference";
import { getSessionContext } from "@/lib/auth/session";
import { canAccessSalesOrder } from "@/lib/sales/access";
import { redactCustomerInvoiceCosts } from "@/lib/auth/invoice-cost-access";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureDocumentsLoaded(["clients", "sales_orders", "customer_invoices"]);
  const raw = await getCustomerInvoiceByIdFresh(id);
  if (!raw) notFound();

  const order = await getSalesOrderByIdFresh(raw.sales_order_id);
  const session = await getSessionContext();
  if (!order || !canAccessSalesOrder(session, order)) notFound();
  if (!session.isSalesOperator) await ensureFabricOrdersLoaded();
  const fabricPos = order && !session.isSalesOperator
    ? listStoredFabricOrders().filter(
        (po) =>
          po.sales_order_id === order.id ||
          order.fabric_po_ids.includes(po.id) ||
          po.client_reference?.includes(order.so_number)
      )
    : [];
  const fabricLines = enrichInvoiceLinesWithFabricDetails(raw.lines, order);
  const resolvedLines = sortInvoiceLinesByArticle(
    resolveInvoiceLines(
      session.isSalesOperator ? fabricLines : enrichInvoiceLinesWithCostHints(fabricLines, order)
    )
  );
  const lineCrossRefs = buildInvoiceLineCrossRefs(resolvedLines, order, fabricPos);
  const lineSwatchKeys = buildInvoiceLineSwatchKeys(resolvedLines, order);
  const invoiceWithVat = enrichInvoiceVat(
    enrichInvoiceDeliveryDestination(
      {
        ...raw,
        delivery_destination: raw.delivery_destination ?? null,
        lines: resolvedLines,
      },
      order
    )
  );
  const invoice = session.isSalesOperator
    ? redactCustomerInvoiceCosts(invoiceWithVat)
    : invoiceWithVat;

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
        lineCrossRefs={lineCrossRefs}
        lineSwatchKeys={lineSwatchKeys}
      />
    </div>
  );
}
