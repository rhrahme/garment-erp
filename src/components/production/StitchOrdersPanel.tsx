"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { OrdersList } from "@/components/orders/OrdersList";
import { StitchOrderBoard } from "@/components/production/StitchOrderBoard";
import { useProductionWorkOrders } from "@/components/production/useProductionWorkOrders";
import {
  listBespokeSalesOrdersClient,
  toSalesOrderListRowClient,
} from "@/lib/sales-orders/to-list-row-client";
import { dedupeIdenticalSalesOrders } from "@/lib/sales-orders/duplicate-order";
import type { SalesOrder } from "@/lib/types/sales-orders";
import type { SewingSession } from "@/lib/types/sewing-sessions";

export function StitchOrdersPanel({ openSessions }: { openSessions: SewingSession[] }) {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const { workOrders, loading: woLoading, error: woError } = useProductionWorkOrders();

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sales-orders");
      const json = (await res.json()) as { orders?: SalesOrder[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load orders");
      setOrders(json.orders ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const listRows = useMemo(
    () =>
      dedupeIdenticalSalesOrders(listBespokeSalesOrdersClient(orders)).map((order) =>
        toSalesOrderListRowClient(order)
      ),
    [orders]
  );

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? null,
    [orders, selectedOrderId]
  );

  if (selectedOrder) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        {(woError || error) && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {woError ?? error}
          </div>
        )}
        {woLoading ? (
          <p className="text-base text-slate-500">Loading pieces...</p>
        ) : (
          <StitchOrderBoard
            order={selectedOrder}
            workOrders={workOrders}
            openSessions={openSessions}
            onBack={() => setSelectedOrderId(null)}
          />
        )}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
        <h2 className="text-xl font-semibold text-slate-900">Production Orders</h2>
        <p className="mt-1 text-sm text-slate-500">
          Open a client order to see which pieces are ready, sewing now, or already left sewing.
          Scan still works on this tab.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-base text-slate-500">Loading orders...</p>
      ) : (
        <OrdersList
          orders={listRows}
          stitchMode
          onOrderOpen={(orderId) => setSelectedOrderId(orderId)}
        />
      )}
    </section>
  );
}
