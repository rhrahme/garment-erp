import { notFound, redirect } from "next/navigation";
import { canViewMoney } from "@/lib/auth/invoice-amounts-access";
import { getSessionContext } from "@/lib/auth/session";
import { getCustomerInvoiceByIdFresh } from "@/lib/data/customer-invoices";
import { getSalesOrderByIdFresh } from "@/lib/data/sales-orders";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { canAccessSalesOrder } from "@/lib/sales/access";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function InvoiceCostHintPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionContext();
  if (!canViewMoney(session)) notFound();

  const { id } = await params;
  await ensureDocumentsLoaded(["clients", "sales_orders", "customer_invoices"]);
  const invoice = await getCustomerInvoiceByIdFresh(id);
  if (!invoice) notFound();
  const order = await getSalesOrderByIdFresh(invoice.sales_order_id);
  if (!order || !canAccessSalesOrder(session, order)) notFound();

  redirect(`/costing/print?invoice=${encodeURIComponent(id)}`);
}
