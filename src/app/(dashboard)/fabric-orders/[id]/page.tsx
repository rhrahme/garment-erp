import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, StatusBadge } from "@/components/ui/PageHeader";
import { SalesOrderActions } from "@/components/orders/SalesOrderActions";
import {
  FABRIC_PRICE_UNLOCK_COOKIE,
  hasFabricPriceAccess,
  redactSalesOrderFabricPrices,
} from "@/lib/auth/fabric-price-access";
import { getSessionContext } from "@/lib/auth/session";
import { getCustomerInvoiceBySalesOrderId } from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getSalesOrderByIdFresh, isReadyMadeSalesOrder } from "@/lib/data/sales-orders";
import { getFabricTotalsSummary } from "@/lib/sales-orders/fabric-weight";
import { fabricOrderUiLabels } from "@/lib/orders/fabric-order-ui-labels";
import { formatDate } from "@/lib/utils";

export default async function FabricOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await ensureDocumentsLoaded(["sales_orders", "customer_invoices"]);
  const rawOrder = await getSalesOrderByIdFresh(id);
  if (!rawOrder) notFound();
  const session = await getSessionContext();
  const labels = fabricOrderUiLabels(session.isClientManager);
  const cookieStore = await cookies();
  const canViewFabricPrices = hasFabricPriceAccess(
    session,
    cookieStore.get(FABRIC_PRICE_UNLOCK_COOKIE)?.value
  );
  const order = canViewFabricPrices ? rawOrder : redactSalesOrderFabricPrices(rawOrder);
  const existingInvoice = getCustomerInvoiceBySalesOrderId(order.id);
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
          <Link href="/fabric-orders" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
            {labels.allOrdersLink}
          </Link>
        }
      />

      <div
        className={`mb-8 grid gap-4 ${
          order.fabric_lines.length > 0
            ? order.product_article
              ? "sm:grid-cols-2 lg:grid-cols-6"
              : "sm:grid-cols-2 lg:grid-cols-5"
            : order.product_article
              ? "sm:grid-cols-5"
              : "sm:grid-cols-4"
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
          <p className="mt-1 font-semibold text-slate-900">{order.delivery_destination ?? "Not set"}</p>
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
            <p className="mt-1 text-lg font-semibold text-slate-900">{fabricTotals.total_meters.toFixed(1)} m</p>
            <p className="mt-1 text-xs text-slate-600">
              {fabricTotals.line_count} fabric line{fabricTotals.line_count !== 1 ? "s" : ""}
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
        viewMode="fabric_order"
      />
    </div>
  );
}
