"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Archive, Search } from "lucide-react";
import { FactoryBrandTabs } from "@/components/brands/FactoryBrandTabs";
import { StatusBadge } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { DownloadSalesOrderPdfButton } from "@/components/orders/DownloadSalesOrderPdfButton";
import { getBrandClientCodePrefix } from "@/lib/clients/codes";
import { SALES_ORDER_ARCHIVE_AGE_MONTHS } from "@/lib/sales-orders/archive";
import { salesOrderMatchesSearch } from "@/lib/sales-orders/list-search";
import { useFactoryBrandFilter } from "@/hooks/useFactoryBrandFilter";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatDate } from "@/lib/utils";
import { ordersUiLabels } from "@/lib/orders/ui-labels";
import type { SalesOrderListRow } from "@/lib/data/sales-orders";

type OrdersView = "active" | "archived";

export function OrdersList({
  orders,
  productionMode = false,
}: {
  orders: SalesOrderListRow[];
  productionMode?: boolean;
}) {
  const labels = ordersUiLabels(productionMode);
  const { brandId, setBrandId, hydrated } = useFactoryBrandFilter();
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 200);
  const [view, setView] = useState<OrdersView>("active");

  const activeOrders = useMemo(() => orders.filter((order) => !order.is_archived), [orders]);
  const archivedOrders = useMemo(() => orders.filter((order) => order.is_archived), [orders]);
  const viewOrders = view === "archived" ? archivedOrders : activeOrders;

  const filteredOrders = useMemo(() => {
    let result = viewOrders;

    if (brandId) {
      const prefix = getBrandClientCodePrefix(brandId);
      if (prefix) {
        result = result.filter(
          (order) => order.client_code.startsWith(`${prefix}-`) || order.client_code === prefix
        );
      }
    }

    if (debouncedSearchQuery.trim()) {
      result = result.filter((order) => salesOrderMatchesSearch(order, debouncedSearchQuery));
    }

    return result;
  }, [brandId, debouncedSearchQuery, viewOrders]);

  const hasActiveFilters = Boolean(searchQuery.trim() || brandId);

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center">
        <p className="text-lg font-medium text-slate-700">{labels.emptyTitle}</p>
        <p className="mt-2 text-sm text-slate-500">{labels.emptyDescription}</p>
        <Link href="/orders/new" className="mt-4 inline-block">
          <Button>{labels.newButton}</Button>
        </Link>
      </div>
    );
  }

  if (view === "active" && activeOrders.length === 0 && archivedOrders.length > 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setView("active")}
            className="rounded-lg border border-indigo-600 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-900"
          >
            Active <span className="ml-1.5 text-xs font-normal opacity-80">(0)</span>
          </button>
          <button
            type="button"
            onClick={() => setView("archived")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-slate-300"
          >
            <Archive className="h-3.5 w-3.5" />
            Archived <span className="text-xs font-normal opacity-80">({archivedOrders.length})</span>
          </button>
        </div>
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center">
          <p className="text-lg font-medium text-slate-700">No active orders</p>
          <p className="mt-2 text-sm text-slate-500">
            All {archivedOrders.length} order{archivedOrders.length !== 1 ? "s are" : " is"} older than{" "}
            {SALES_ORDER_ARCHIVE_AGE_MONTHS} months and in Archived.
          </p>
          <Button variant="secondary" className="mt-4" onClick={() => setView("archived")}>
            View archived orders
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setView("active")}
          className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
            view === "active"
              ? "border-indigo-600 bg-indigo-50 text-indigo-900"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          }`}
        >
          Active
          <span className="ml-1.5 text-xs font-normal opacity-80">({activeOrders.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setView("archived")}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
            view === "archived"
              ? "border-slate-600 bg-slate-100 text-slate-900"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          }`}
        >
          <Archive className="h-3.5 w-3.5" />
          Archived
          <span className="text-xs font-normal opacity-80">({archivedOrders.length})</span>
        </button>
        <p className="text-xs text-slate-500">
          Orders older than {SALES_ORDER_ARCHIVE_AGE_MONTHS} months move to Archived automatically.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="relative block min-w-[240px] flex-1 text-sm">
          <span className="font-medium text-slate-700">Search orders</span>
          <Search className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Order #, client, fabric, supplier…"
            className="mt-1 block w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
          />
        </label>
        {hasActiveFilters && (
          <p className="text-sm text-slate-500">
            {filteredOrders.length} of {viewOrders.length} order{viewOrders.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {hydrated && (
        <FactoryBrandTabs value={brandId} onChange={setBrandId} showAll allLabel="All brands" label="Filter by brand" />
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Order / client</th>
              <th className="px-4 py-3">Client code</th>
              <th className="px-4 py-3 text-center">Art.</th>
              <th className="px-4 py-3">Fabrics</th>
              <th className="px-4 py-3">Availability</th>
              {productionMode && <th className="px-4 py-3">Production labels</th>}
              <th className="px-4 py-3">Order Date</th>
              <th className="px-4 py-3">Delivery</th>
              <th className="px-4 py-3">Status</th>
              <th className="sticky right-0 z-10 bg-slate-50 px-4 py-3 shadow-[-8px_0_12px_-8px_rgba(15,23,42,0.15)]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={productionMode ? 10 : 9} className="px-4 py-10 text-center text-slate-500">
                  {hasActiveFilters
                    ? "No orders match your search."
                    : view === "archived"
                      ? "No archived orders yet."
                      : "No orders for this brand."}
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => {
                const archivedRow = view === "archived" || order.is_archived;
                const rowBg = archivedRow ? "bg-slate-50/40 hover:bg-slate-50" : "bg-white hover:bg-slate-50/60";
                return (
                <tr
                  key={order.id}
                  className={archivedRow ? "bg-slate-50/40 hover:bg-slate-50" : "hover:bg-slate-50/60"}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{order.so_number}</p>
                    <p className="mt-0.5 text-sm font-medium text-slate-700">{order.client_name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs text-slate-500">{order.client_code}</p>
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-xs font-semibold text-slate-700">
                    {order.fabric_article_labels.length > 0 ? order.fabric_article_labels.join(" · ") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {order.fabric_line_count} line{order.fabric_line_count !== 1 ? "s" : ""}
                  </td>
                  <td className="px-4 py-3">
                    {order.fabric_stock_alert_count > 0 ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
                        {order.fabric_stock_alert_count} issue{order.fabric_stock_alert_count !== 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  {productionMode && (
                    <td className="px-4 py-3">
                      {order.production_label_count > 0
                        ? `${order.production_label_count} label${order.production_label_count !== 1 ? "s" : ""}`
                        : "—"}
                    </td>
                  )}
                  <td className="px-4 py-3">{formatDate(order.order_date)}</td>
                  <td className="px-4 py-3">{order.delivery_date ? formatDate(order.delivery_date) : "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className={`sticky right-0 z-10 px-4 py-3 shadow-[-8px_0_12px_-8px_rgba(15,23,42,0.15)] ${rowBg}`}>
                    <div className="flex min-w-[12.5rem] items-center gap-2 whitespace-nowrap">
                      <DownloadSalesOrderPdfButton
                        orderId={order.id}
                        soNumber={order.so_number}
                        variant="secondary"
                        size="sm"
                        label="Download"
                      />
                      <Link href={`/orders/${order.id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                        Open →
                      </Link>
                    </div>
                  </td>
                </tr>
              );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
