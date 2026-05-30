"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/PageHeader";
import { formatLabelGarmentDescription } from "@/lib/sales-orders/label-codes";
import { PRODUCTION_STAGES, type ProductionWorkOrder } from "@/lib/types/production";
import { formatDate } from "@/lib/utils";
import { useProductionWorkOrders } from "@/components/production/useProductionWorkOrders";

const FLOOR_STAGES = ["cutting", "sewing", "washing", "finishing", "packed", "completed"] as const;

function stageActionLabel(order: ProductionWorkOrder): string | null {
  switch (order.status) {
    case "cutting":
      return "Move to sewing";
    case "sewing":
      return "Move to garment wash";
    case "washing":
      return "Move to finishing";
    case "finishing":
      return "Move to packed";
    case "packed":
      return "Mark completed";
    default:
      return null;
  }
}

function pipelineStageLabel(stage: (typeof PRODUCTION_STAGES)[number]) {
  if (stage === "washing") return "Garment wash";
  return stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ProductionFloorWorkspace() {
  const { workOrders, loading, error, load, setError } = useProductionWorkOrders();
  const [actingId, setActingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const floorOrders = workOrders.filter((order) =>
    FLOOR_STAGES.includes(order.status as (typeof FLOOR_STAGES)[number])
  );
  const activeOrders = floorOrders.filter((order) => order.status !== "completed");
  const completedOrders = floorOrders.filter((order) => order.status === "completed");

  async function advanceStage(id: string) {
    setError(null);
    setMessage(null);
    setActingId(id);
    try {
      const res = await fetch(`/api/production/work-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to advance stage");
      setMessage(`Updated to ${data.work_order.status.replace(/_/g, " ")}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to advance stage");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}
      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      <div>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Production pipeline</h2>
        <div className="flex flex-wrap gap-2">
          {FLOOR_STAGES.map((stage) => {
            const count = workOrders.filter((order) => order.status === stage).length;
            return (
              <div key={stage} className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-center">
                <p className="text-2xl font-bold text-slate-900">{count}</p>
                <p className="text-xs font-medium text-slate-600">{pipelineStageLabel(stage)}</p>
              </div>
            );
          })}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading production work orders…</p>
      ) : activeOrders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
          No pieces on the production floor yet — fabric must be received and prepped under Fabric Receiving first.
        </p>
      ) : (
        <div className="space-y-3">
          {activeOrders.map((order) => {
            const action = stageActionLabel(order);
            return (
              <div key={order.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="md:flex md:items-start md:justify-between md:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-semibold text-indigo-800">{order.sticker_code}</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {order.client_name} · {formatLabelGarmentDescription(order.garment_type, order.piece_name)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {order.so_number} · {order.supplier_name} {order.fabric_number} · {order.fabric_meters} m · received{" "}
                      {formatDate(order.received_at.slice(0, 10))}
                    </p>
                  </div>
                  <div className="mt-3 md:mt-0 md:shrink-0">
                    <StatusBadge status={order.status === "washing" ? "washing" : order.status} />
                  </div>
                </div>

                {action && (
                  <div className="border-t border-slate-100 pt-3">
                    <Button size="sm" onClick={() => void advanceStage(order.id)} disabled={actingId === order.id}>
                      <ArrowRight className="mr-1 h-4 w-4" />
                      {actingId === order.id ? "Updating…" : action}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {completedOrders.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Completed</h2>
          <div className="space-y-2">
            {completedOrders.map((order) => (
              <div key={order.id} className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                <span className="font-mono font-medium text-slate-700">{order.sticker_code}</span>
                <span className="mx-2 text-slate-300">·</span>
                <span className="text-slate-600">
                  {order.client_name} — {formatLabelGarmentDescription(order.garment_type, order.piece_name)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
