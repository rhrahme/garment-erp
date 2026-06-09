"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { FabricReceivingOverview } from "@/lib/types/fabric-receipts";

type FabricReceivingTestingResetProps = {
  reloadKey: number;
  onResetComplete: () => void;
  onMessage: (message: string | null) => void;
  onError: (error: string | null) => void;
};

export function FabricReceivingTestingReset({
  reloadKey,
  onResetComplete,
  onMessage,
  onError,
}: FabricReceivingTestingResetProps) {
  const [overview, setOverview] = useState<FabricReceivingOverview | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [clearPrintTimestamps, setClearPrintTimestamps] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [canReset, setCanReset] = useState(false);

  const loadOverview = useCallback(async () => {
    const res = await fetch(`/api/fabric-receiving/overview?filter=all_open&t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = (await res.json()) as FabricReceivingOverview;
    setOverview(data);
    setSelectedOrderId((current) => current || data.orders[0]?.sales_order_id || "");
  }, []);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => setCanReset(Boolean(data.is_admin || data.is_client_manager)))
      .catch(() => setCanReset(false));
  }, []);

  useEffect(() => {
    if (!canReset) return;
    void loadOverview();
  }, [canReset, loadOverview, reloadKey]);

  const orderOptions = useMemo(() => overview?.orders ?? [], [overview]);
  const selectedOrder = orderOptions.find((order) => order.sales_order_id === selectedOrderId);

  const resettableLineCount = useMemo(() => {
    if (!selectedOrder) return 0;
    return selectedOrder.lines.filter((line) => line.status !== "pending").length;
  }, [selectedOrder]);

  if (!canReset) return null;

  async function handleReset() {
    if (!selectedOrderId) {
      onError("Select a sales order to reset.");
      return;
    }

    const label = selectedOrder
      ? `${selectedOrder.so_number} (${resettableLineCount} line${resettableLineCount === 1 ? "" : "s"} with receiving progress)`
      : "this order";

    if (
      !window.confirm(
        `Testing only: reset fabric receiving for ${label}?\n\nThis clears received / prep / handoff state and removes linked production work orders. Fabric lines and sticker codes stay intact.${
          clearPrintTimestamps ? "\n\nPrint timestamps (A4 + stickers) will also be cleared." : ""
        }`
      )
    ) {
      return;
    }

    setResetting(true);
    onError(null);
    onMessage(null);
    try {
      const res = await fetch("/api/fabric-receiving/reset-testing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sales_order_id: selectedOrderId,
          clear_print_timestamps: clearPrintTimestamps,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reset fabric receiving.");

      onMessage(
        `Testing reset complete for ${data.so_number}: ${data.reset_line_ids.length} line${
          data.reset_line_ids.length === 1 ? "" : "s"
        } back to pending${
          data.cleared_print_line_ids?.length
            ? `; cleared print timestamps on ${data.cleared_print_line_ids.length} line${
                data.cleared_print_line_ids.length === 1 ? "" : "s"
              }`
            : ""
        }.`
      );
      onResetComplete();
      await loadOverview();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to reset fabric receiving.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-amber-950">Testing only — reset receiving</h2>
          <p className="mt-1 text-sm text-amber-900/90">
            Undo receive, wash/soak/iron prep, and handoff while testing label printing. Fabric lines and sticker codes
            are kept. Production work orders created at handoff are removed.
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="block min-w-[16rem] flex-1 text-sm">
              <span className="font-medium text-amber-950">Sales order</span>
              <select
                value={selectedOrderId}
                onChange={(e) => setSelectedOrderId(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
              >
                {orderOptions.length === 0 ? (
                  <option value="">No open orders with fabric lines</option>
                ) : (
                  orderOptions.map((order) => (
                    <option key={order.sales_order_id} value={order.sales_order_id}>
                      {order.so_number} · {order.client_name} ({order.lines.length} line
                      {order.lines.length === 1 ? "" : "s"})
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-amber-950">
              <input
                type="checkbox"
                checked={clearPrintTimestamps}
                onChange={(e) => setClearPrintTimestamps(e.target.checked)}
                className="rounded border-amber-400"
              />
              Also clear A4 + sticker print timestamps
            </label>

            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleReset()}
              disabled={resetting || !selectedOrderId || resettableLineCount === 0}
            >
              {resetting ? "Resetting…" : "Reset receiving (testing)"}
            </Button>
          </div>

          {selectedOrder && resettableLineCount === 0 && (
            <p className="mt-3 text-sm text-amber-800">All lines on this order are already pending receive.</p>
          )}
        </div>
      </div>
    </section>
  );
}
