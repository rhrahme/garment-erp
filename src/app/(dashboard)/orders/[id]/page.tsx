import { cookies } from "next/headers";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { orderStickerSheetHref } from "@/lib/orders/sticker-print-links";
import { notFound, redirect } from "next/navigation";
import { FabricCostSummaryBlock } from "@/components/orders/FabricCostSummaryBlock";
import { DownloadSalesOrderPdfButton } from "@/components/orders/DownloadSalesOrderPdfButton";
import { PageHeader, StatusBadge } from "@/components/ui/PageHeader";
import { SalesOrderActions } from "@/components/orders/SalesOrderActions";
import {
  FABRIC_PRICE_UNLOCK_COOKIE,
  canRevealFabricPrices,
  hasFabricPriceAccess,
  redactPurchaseOrderPrices,
  redactSalesOrderFabricPrices,
} from "@/lib/auth/fabric-price-access";
import { getSessionContext } from "@/lib/auth/session";
import { getCustomerInvoiceBySalesOrderIdFresh } from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readPatternJobsFresh } from "@/lib/data/pattern-jobs";
import { getSalesOrderByIdFresh, isReadyMadeSalesOrder } from "@/lib/data/sales-orders";
import { ensureFabricOrdersLoaded, listStoredFabricOrders } from "@/lib/integrations/fabric-order-store";
import { getFabricPosForSalesOrder } from "@/lib/sales-orders/line-cross-reference";
import { activePatternJobsForLine } from "@/lib/pattern/sync-guard";
import {
  resolveFabricCostForOrderLines,
  resolveFabricUnitPricesForOrderLines,
} from "@/lib/sales-orders/fabric-cost.server";
import { getFabricTotalsSummary } from "@/lib/sales-orders/fabric-weight";
import { detectPatternSalesOrderMismatch } from "@/lib/sales-orders/pattern-so-mismatch";
import { getRemovedSalesOrderRedirectForKey } from "@/lib/sales-orders/removed-order-redirects";
import { ordersUiLabels } from "@/lib/orders/ui-labels";
import { OrderShipmentTracking } from "@/components/orders/OrderShipmentTracking";
import { PatternMismatchBanner } from "@/components/pattern/PatternMismatchBanner";
import { formatDate } from "@/lib/utils";
import { canAccessSalesOrder } from "@/lib/sales/access";

export const dynamic = "force-dynamic";

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
  if (!canAccessSalesOrder(session, rawOrder)) notFound();
  if (!session.isSalesOperator) {
    await ensureDocumentsLoaded(["pattern_jobs"]);
    await ensureFabricOrdersLoaded();
  }
  const rawFabricPos = session.isSalesOperator
    ? []
    : getFabricPosForSalesOrder(rawOrder, listStoredFabricOrders());
  const patternJobs = session.isSalesOperator ? [] : (await readPatternJobsFresh()).jobs;
  const patternMismatch = session.isSalesOperator
    ? null
    : detectPatternSalesOrderMismatch(rawOrder, patternJobs);
  const patternJobsByLineId = session.isSalesOperator
    ? {}
    : Object.fromEntries(
        rawOrder.fabric_lines.map((line) => [line.id, activePatternJobsForLine(rawOrder.id, line.id)])
      );
  const taskOperatorMode = session.isTaskOperator;
  const productionMode = session.isClientManager || taskOperatorMode;
  const labels = ordersUiLabels(productionMode, taskOperatorMode);
  const cookieStore = await cookies();
  const canViewFabricPrices = hasFabricPriceAccess(
    session,
    cookieStore.get(FABRIC_PRICE_UNLOCK_COOKIE)?.value
  );
  const showFabricCostToAdmin = canRevealFabricPrices(session);
  const order = canViewFabricPrices
    ? { ...rawOrder, fabric_lines: resolveFabricUnitPricesForOrderLines(rawOrder.fabric_lines) }
    : redactSalesOrderFabricPrices(rawOrder);
  const fabricPos = canViewFabricPrices
    ? rawFabricPos
    : rawFabricPos.map(redactPurchaseOrderPrices);
  const existingInvoice = await getCustomerInvoiceBySalesOrderIdFresh(order.id);
  const fabricTotals = getFabricTotalsSummary(order.fabric_lines);
  const fabricCostResult =
    showFabricCostToAdmin ? resolveFabricCostForOrderLines(rawOrder.fabric_lines) : null;
  const fabricCost = fabricCostResult?.summary ?? null;

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
            {taskOperatorMode && order.fabric_lines.length > 0 ? (
              <>
                <Link href={orderStickerSheetHref(order.id, "fabric-cuts")}>
                  <Button variant="secondary" size="sm">
                    Fabric stickers
                  </Button>
                </Link>
                <Link href={orderStickerSheetHref(order.id, "pieces")}>
                  <Button variant="secondary" size="sm">
                    Cutting stickers
                  </Button>
                </Link>
              </>
            ) : null}
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

      {patternMismatch && <PatternMismatchBanner mismatch={patternMismatch} />}

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
            {fabricCostResult ? (
              <FabricCostSummaryBlock
                summary={fabricCostResult.summary}
                error={fabricCostResult.error}
                hidden={!canViewFabricPrices}
                showRevealToggle={showFabricCostToAdmin}
                canViewFabricPrices={canViewFabricPrices}
              />
            ) : null}
          </div>
        )}
      </div>

      {!session.isSalesOperator && (
        <OrderShipmentTracking salesOrderId={order.id} fabricPoIds={order.fabric_po_ids} />
      )}

      <SalesOrderActions
        order={order}
        fabricPos={fabricPos}
        patternMismatch={patternMismatch}
        patternJobsByLineId={patternJobsByLineId}
        existingInvoiceId={existingInvoice?.id ?? null}
        isReadyMade={isReadyMadeSalesOrder(order)}
        canViewFabricPrices={canViewFabricPrices}
        showFabricPriceControls={showFabricCostToAdmin}
        fabricCostSummary={fabricCost}
        isClientManager={session.isClientManager}
        isTaskOperator={taskOperatorMode}
        isSalesOperator={session.isSalesOperator}
        productionMode={productionMode}
        viewMode={
          session.isSalesOperator ? "fabric_order" : productionMode ? "production" : "sales"
        }
      />
    </div>
  );
}
