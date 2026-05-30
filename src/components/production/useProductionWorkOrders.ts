"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProductionWorkOrder } from "@/lib/types/production";

function normalizeWorkOrders(orders: ProductionWorkOrder[]): ProductionWorkOrder[] {
  return orders.map((order) => (order.status === "planned" ? { ...order, status: "received" } : order));
}

export function useProductionWorkOrders() {
  const [workOrders, setWorkOrders] = useState<ProductionWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/production/work-orders");
      if (!res.ok) throw new Error("Failed to load production work orders");
      const data = (await res.json()) as { work_orders: ProductionWorkOrder[] };
      setWorkOrders(normalizeWorkOrders(data.work_orders));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load production work orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { workOrders, loading, error, load, setError };
}
