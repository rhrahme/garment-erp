import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DownloadSalesOrderPdfButton } from "@/components/orders/DownloadSalesOrderPdfButton";
import { PageHeader, StatusBadge } from "@/components/ui/PageHeader";
import { SalesOrderActions } from "@/components/orders/SalesOrderActions";
import {
  FABRIC_PRICE_UNLOCK_COOKIE,
  hasFabricPriceAccess,
  redactSalesOrderFabricPrices,
} from "@/lib/auth/fabric-price-access";
import { getSessionContext } from "@/lib/auth/session";
import { getCustomerInvoiceBySalesOrderIdFresh } from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getSalesOrderByIdFresh, isReadyMadeSalesOrder } from "@/lib/data/sales-orders";
import { getFabricTotalsSummary } from "@/lib/sales-orders/fabric-weight";
import { getRemovedSalesOrderRedirectForKey } from "@/lib/sales-orders/removed-order-redirects";
import { ordersUiLabels } from "@/lib/orders/ui-labels";
import { formatDate } from "@/lib/utils";

export default async function SalesOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const removedRedirect = getRemovedSalesOrderRedirectForKey(id);
  if (removedRedirect) redirect(removedRedirect);
  await ensureDocumentsLoaded(["sales_orders", "customer_invoices"]);
  const rawOrder = await getSalesOrderByIdFresh(id);
  if (!rawOrder) notFound();
  const session = await getSessionContext();
  const labels = ordersUiLabels(session.isClientManager);
  const cookieStore = await cookies();
  const canViewFabricPrices = hasFabricPriceAccess(
    session,
    cookieStore.get(FABRIC_PRICE_UNLOCK_COOKIE)?.value
  );
  const order = canViewFabricPrices ? rawOrder : redactSalesOrderFabricPrices(rawOrder);
  const existingInvoice = await getCustomerInvoiceBySalesOrderIdFresh(order.id);
  const fabricTotals = getFabricTotalsSummary(order.fabric_lines);

  return (
    <div>
      <PageHeader
        title={order.so_number}
        description={
          order.product_article
            ? `${order.client_name} · ${order.product_article} · ${order.client_code}`
            : `${order.client_name} · ${order.client_code}`
        }
        action={
          <div className="flex flex-wrap items-center gap-3">
            <DownloadSalesOrderPdfButton
              orderId={order.id}
              soNumber={order.so_number}
              variant="secondary"
            />
            <Link href="/orders" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
              {labels.allOrdersLink}
            </Link>
          </div>
        }
      />

      <div
        className={`mb-8 grid gap-4 ${
          order.fabric_lines.length > 0
            ? order.product_article
              ? "sm:grid-cols-2 lg:grid-cols-7"
              : "sm:grid-cols-2 lg:grid-cols-6"
            : order.product_article
              ? "sm:grid-cols-6"
              : "sm:grid-cols-5"
        }`}
      >
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">{order.retail_brand ? "Retail brand" : "Client"}</p>
          <p className="mt-1 font-semibold text-slate-900">{order.client_name}</p>
          <p className="font-mono text-xs text-indigo-600">{order.client_code}</p>
        </div>
        {order.product_article && (
          <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-5">
            <p className="text-sm text-violet-700">Article</p>
            <p className="mt-1 font-semibold text-slate-900">{order.product_article}</p>
          </div>
        )}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Order date</p>
          <p className="mt-1 font-semibold text-slate-900">{formatDate(order.order_date)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Ship fabrics to</p>
          <p className="mt-1 font-semibold text-slate-900">
            {order.delivery_destination ?? "Not set"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Delivery date</p>
          <p className="mt-1 font-semibold text-slate-900">
            {order.delivery_date ? formatDate(order.delivery_date) : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Status</p>
          <p className="mt-2">
            <StatusBadge status={order.status} />
          </p>
        </div>
        {order.fabric_lines.length > 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
            <p className="text-sm text-emerald-800">Fabric totals</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {fabricTotals.total_meters.toFixed(1)} m
              {fabricTotals.total_kg != null ? (
                <span className="text-slate-700"> · {fabricTotals.total_kg.toFixed(1)} kg</span>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {fabricTotals.line_count} fabric line{fabricTotals.line_count !== 1 ? "s" : ""}
              {fabricTotals.total_kg != null &&
              fabricTotals.weighed_line_count < fabricTotals.line_count
                ? ` · kg from ${fabricTotals.weighed_line_count} lines with width & gsm`
                : fabricTotals.total_kg == null
                  ? " · add width & gsm on lines to estimate kg"
                  : null}
            </p>
          </div>
        )}
      </div>

      <SalesOrderActions
        order={order}
        existingInvoiceId={existingInvoice?.id ?? null}
        isReadyMade={isReadyMadeSalesOrder(order)}
        canViewFabricPrices={canViewFabricPrices}
        isClientManager={session.isClientManager}
        productionMode={session.isClientManager}
        viewMode={session.isClientManager ? "production" : "sales"}
      />
    </div>
  );
}
