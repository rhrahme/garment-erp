"use client";

import Link from "next/link";
import { useMemo } from "react";
import { FactoryBrandTabs } from "@/components/brands/FactoryBrandTabs";
import { StatusBadge } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { getBrandClientCodePrefix } from "@/lib/clients/codes";
import { useFactoryBrandFilter } from "@/hooks/useFactoryBrandFilter";
import { formatDate } from "@/lib/utils";
import type { SalesOrderListRow } from "@/lib/data/sales-orders";

export function OrdersList({ orders }: { orders: SalesOrderListRow[] }) {
  const { brandId, setBrandId, hydrated } = useFactoryBrandFilter();

  const filteredOrders = useMemo(() => {
    if (!brandId) return orders;
    const prefix = getBrandClientCodePrefix(brandId);
    if (!prefix) return orders;
    return orders.filter((order) => order.client_code.startsWith(`${prefix}-`) || order.client_code === prefix);
  }, [brandId, orders]);

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center">
        <p className="text-lg font-medium text-slate-700">No sales orders yet</p>
        <p className="mt-2 text-sm text-slate-500">Create your first order to start the fabric PO workflow.</p>
        <Link href="/orders/new" className="mt-4 inline-block">
          <Button>+ New Sales Order</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {hydrated && (
        <FactoryBrandTabs value={brandId} onChange={setBrandId} showAll allLabel="All brands" label="Filter by brand" />
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Order #</th>
              <th className="px-4 py-3">Client / Brand</th>
              <th className="px-4 py-3">Article</th>
              <th className="px-4 py-3">Fabrics</th>
              <th className="px-4 py-3">Order Date</th>
              <th className="px-4 py-3">Delivery</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  No orders for this brand.
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium">{order.so_number}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{order.client_name}</p>
                    <p className="font-mono text-xs text-slate-400">{order.client_code}</p>
                  </td>
                  <td className="px-4 py-3">{order.product_article ?? "—"}</td>
                  <td className="px-4 py-3">
                    {order.fabric_line_count} line{order.fabric_line_count !== 1 ? "s" : ""}
                  </td>
                  <td className="px-4 py-3">{formatDate(order.order_date)}</td>
                  <td className="px-4 py-3">{order.delivery_date ? formatDate(order.delivery_date) : "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/orders/${order.id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                      Open →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
