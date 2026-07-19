"use client";

import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { CompletedProductionHistory } from "@/components/production/CompletedProductionHistory";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/PageHeader";
import { formatLabelGarmentDescription } from "@/lib/sales-orders/label-codes";
import { FabricSupplierName } from "@/components/fabric/FabricSupplierName";
import { PRODUCTION_STAGES, type ProductionWorkOrder } from "@/lib/types/production";
import { cn, formatDate } from "@/lib/utils";
import { useProductionWorkOrders } from "@/components/production/useProductionWorkOrders";
import { ScanStageLegend } from "@/components/production/ScanStageLegend";
import { StageScanPanel } from "@/components/production/StageScanPanel";
import { completedAccountLabel, isReadyMadeWorkOrder } from "@/lib/production/completed-history";
import { productionStageToHighlight, scanStageStyles } from "@/lib/production/scan-stage-highlight";

const PIPELINE_STAGES = ["cutting", "sewing", "washing", "finishing", "packed"] as const;
const FLOOR_STAGES = [...PIPELINE_STAGES, "completed"] as const;

type ProductionFloorTab = "pipeline" | "completed";

const TABS: { id: ProductionFloorTab; label: string }[] = [
  { id: "pipeline", label: "Pipeline" },
  { id: "completed", label: "Completed" },
];

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
  const [tab, setTab] = useState<ProductionFloorTab>("pipeline");
  const [actingId, setActingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const floorOrders = workOrders.filter((order) =>
    FLOOR_STAGES.includes(order.status as (typeof FLOOR_STAGES)[number])
  );
  const activeOrders = floorOrders.filter((order) => order.status !== "completed");
  const completedOrders = useMemo(
    () => floorOrders.filter((order) => order.status === "completed"),
    [floorOrders]
  );

  const tabCounts = useMemo(
    () => ({
      pipeline: activeOrders.length,
      completed: floorOrders.filter((order) => order.status === "completed").length,
    }),
    [activeOrders.length, floorOrders]
  );

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

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Production floor</h2>
          <p className="mt-1 text-sm text-slate-500">
            {tab === "pipeline"
              ? "Active pieces on the floor — scan at the station or advance stages manually."
              : "Finished pieces for lookup and tracking — search by client, order, or sticker code."}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {TABS.map((item) => {
              const count = tabCounts[item.id];
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  )}
                >
                  {item.label}
                  <span className={cn("ml-1.5 tabular-nums", active ? "text-indigo-200" : "text-slate-500")}>
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {tab === "pipeline" ? (
          <div className="space-y-6 p-5">
            <StageScanPanel
              stations={["cutting", "sewing", "garment_wash", "finishing", "packed"]}
              scanContext="production"
              onRefresh={load}
            />

            <ScanStageLegend />

            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Stage counts</h3>
              <div className="flex flex-wrap gap-2">
                {PIPELINE_STAGES.map((stage) => {
                  const count = workOrders.filter((order) => order.status === stage).length;
                  return (
                    <div key={stage} className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-center">
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
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
                No pieces on the production floor yet — fabric must be received and prepped under Fabric Receiving
                first.
              </p>
            ) : (
              <div className="space-y-3">
                {activeOrders.map((order) => {
                  const action = stageActionLabel(order);
                  const rowStyle = scanStageStyles(productionStageToHighlight(order.status));
                  return (
                    <div
                      key={order.id}
                      className={`space-y-3 rounded-xl border border-slate-200 p-4 ${rowStyle.row}`}
                    >
                      <div className="md:flex md:items-start md:justify-between md:gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-semibold text-slate-900">
                            {completedAccountLabel(order)}
                          </p>
                          <p className="mt-0.5 font-mono text-sm font-semibold text-indigo-800">{order.sticker_code}</p>
                          <p className="mt-1 text-sm text-slate-700">
                            {isReadyMadeWorkOrder(order) ? "Ready-made" : "Client"}
                            <span className="mx-1.5 text-slate-300">·</span>
                            {formatLabelGarmentDescription(order.garment_type, order.piece_name)}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {order.so_number} ·{" "}
                            <FabricSupplierName
                              supplierId={order.supplier_id}
                              supplierName={order.supplier_name}
                              fabricNumber={order.fabric_number}
                            />{" "}
                            {order.fabric_number} · {order.fabric_meters} m · received{" "}
                            {formatDate(order.received_at.slice(0, 10))}
                          </p>
                        </div>
                        <div className="mt-3 flex flex-col items-end gap-1 md:mt-0 md:shrink-0">
                          <StatusBadge status={order.status === "washing" ? "washing" : order.status} />
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${rowStyle.chip}`}>
                            {rowStyle.label}
                          </span>
                        </div>
                      </div>

                      {action && (
                        <div className="border-t border-slate-100 pt-3">
                          <Button
                            size="sm"
                            onClick={() => void advanceStage(order.id)}
                            disabled={actingId === order.id}
                          >
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
          </div>
        ) : (
          <div className="p-5">
            <CompletedProductionHistory
              orders={completedOrders}
              loading={loading}
              totalCount={tabCounts.completed}
            />
          </div>
        )}
      </section>
    </div>
  );
}
