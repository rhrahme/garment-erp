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

/** Live stitcher names keyed by sales order id for floor search. */
function liveEmployeeTextByOrderId(
  openSessions: SewingSession[],
  workOrders: { id: string; sales_order_id: string; so_number?: string | null }[],
  orders: SalesOrder[]
): Map<string, string> {
  const orderIdBySo = new Map(
    orders.map((order) => [order.so_number.toLowerCase(), order.id] as const)
  );
  const orderIdByWo = new Map(workOrders.map((wo) => [wo.id, wo.sales_order_id] as const));
  const names = new Map<string, Set<string>>();

  const add = (orderId: string | undefined | null, employeeName: string | null | undefined) => {
    if (!orderId || !employeeName?.trim()) return;
    const set = names.get(orderId) ?? new Set<string>();
    set.add(employeeName.trim());
    names.set(orderId, set);
  };

  for (const session of openSessions) {
    if (session.status !== "open" && session.status !== "closing") continue;
    if (session.work_order_id) {
      add(orderIdByWo.get(session.work_order_id), session.employee_name);
    }
    if (session.so_number) {
      add(orderIdBySo.get(session.so_number.toLowerCase()), session.employee_name);
    }
  }

  const out = new Map<string, string>();
  for (const [orderId, set] of names) {
    out.set(orderId, [...set].join(" ").toLowerCase());
  }
  return out;
}

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

  const listRows = useMemo(() => {
    const employeeByOrder = liveEmployeeTextByOrderId(openSessions, workOrders, orders);
    return dedupeIdenticalSalesOrders(listBespokeSalesOrdersClient(orders)).map((order) => {
      const row = toSalesOrderListRowClient(order);
      const liveEmployees = employeeByOrder.get(order.id);
      if (!liveEmployees) return row;
      return {
        ...row,
        search_text: `${row.search_text} ${liveEmployees}`.trim(),
      };
    });
  }, [openSessions, orders, workOrders]);

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
          Search by employee, garment, brand, or client. Open an order to see pieces ready,
          on the floor now, or already left. Scan still works on this tab.
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
