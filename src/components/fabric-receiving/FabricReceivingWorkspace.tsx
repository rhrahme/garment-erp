"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Package } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AutoSaveStatusBar } from "@/components/ui/AutoSaveStatus";
import { StatusBadge } from "@/components/ui/PageHeader";
import { useFabricReceipts } from "@/components/fabric-receiving/useFabricReceipts";
import { useLocalDraft } from "@/hooks/useLocalDraft";
import { DRAFT_KEYS } from "@/lib/autosave/draft-keys";
import {
  FABRIC_PREP_TYPES,
  completeFabricPrepActionLabel,
  fabricPrepStatusLabel,
  fabricPrepTypeLabel,
} from "@/lib/production/fabric-prep";
import { getGarmentPieces } from "@/lib/sales-orders/label-codes";
import type { FabricReceipt, PendingFabricLine } from "@/lib/types/fabric-receipts";
import type { FabricPrepType } from "@/lib/types/production";
import { formatDate } from "@/lib/utils";


function formatReceiptDescription(receipt: FabricReceipt): string {
  const pieces = getGarmentPieces(receipt.garment_type);
  if (pieces.length === 1) return receipt.garment_type;
  return `${receipt.garment_type} (${pieces.join(" + ")})`;
}

function FabricSpecs({ composition, weightGsm }: { composition: string | null; weightGsm: number | null }) {
  if (!composition && weightGsm == null) return null;

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
      {composition && (
        <p>
          <span className="font-medium text-slate-800">Composition:</span> {composition}
        </p>
      )}
      {weightGsm != null && (
        <p className={composition ? "mt-1" : undefined}>
          <span className="font-medium text-slate-800">Weight:</span> {weightGsm} gsm
        </p>
      )}
    </div>
  );
}

export function FabricReceivingWorkspace() {
  const { receipts, loading, error, load, setError } = useFabricReceipts();
  const [pending, setPending] = useState<PendingFabricLine[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [selectedLineId, setSelectedLineId] = useState("");
  const [prepTypeByReceipt, setPrepTypeByReceipt] = useState<Record<string, FabricPrepType>>({});
  const [receiving, setReceiving] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [readyCount, setReadyCount] = useState(0);

  const workspaceDraft = useMemo(
    () => ({
      selectedLineId,
      prepTypeByReceipt,
    }),
    [selectedLineId, prepTypeByReceipt]
  );

  const { status: workspaceDraftStatus, isDirty: workspaceDraftDirty } = useLocalDraft({
    draftKey: DRAFT_KEYS.fabricReceiving,
    value: workspaceDraft,
    isEmpty: (draft) => !draft.selectedLineId && Object.keys(draft.prepTypeByReceipt).length === 0,
    onRestore: (draft) => {
      setSelectedLineId(draft.selectedLineId);
      setPrepTypeByReceipt(draft.prepTypeByReceipt);
    },
  });

  const loadPending = useCallback(async () => {
    setPendingLoading(true);
    try {
      const res = await fetch("/api/fabric-receiving/pending");
      if (!res.ok) throw new Error("Failed to load expected fabric");
      const data = (await res.json()) as { pending: PendingFabricLine[] };
      setPending(data.pending);
    } catch {
      setPending([]);
    } finally {
      setPendingLoading(false);
    }
  }, []);

  const loadReadyCount = useCallback(async () => {
    try {
      const res = await fetch("/api/production/work-orders");
      if (!res.ok) return;
      const data = (await res.json()) as { work_orders: { status: string }[] };
      setReadyCount(data.work_orders.filter((order) => order.status === "cutting").length);
    } catch {
      setReadyCount(0);
    }
  }, []);

  useEffect(() => {
    void loadPending();
    void loadReadyCount();
  }, [loadPending, loadReadyCount]);

  const receivedCount = receipts.filter((receipt) => receipt.status === "received").length;
  const prepCount = receipts.filter((receipt) => receipt.status === "fabric_prep").length;

  async function handleReceive(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!selectedLineId) {
      setError("Select fabric from the list.");
      return;
    }

    setReceiving(true);
    try {
      const res = await fetch("/api/fabric-receiving/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sales_order_line_id: selectedLineId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to receive fabric");

      setMessage(
        data.created
          ? `Fabric received for ${data.garment_description}. One fabric cut — choose preparation before handoff.`
          : `Fabric already received (${data.garment_description}).`
      );
      setSelectedLineId("");
      await Promise.all([load(), loadPending(), loadReadyCount()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to receive fabric");
    } finally {
      setReceiving(false);
    }
  }

  async function startFabricPrep(id: string) {
    const fabric_prep_type = prepTypeByReceipt[id] ?? "iron_only";
    setError(null);
    setMessage(null);
    setActingId(id);
    try {
      const res = await fetch(`/api/fabric-receiving/receipts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start_fabric_prep", fabric_prep_type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start fabric prep");
      setMessage(`Fabric prep started: ${fabricPrepTypeLabel(fabric_prep_type)}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start fabric prep");
    } finally {
      setActingId(null);
    }
  }

  async function advancePrep(id: string) {
    setError(null);
    setMessage(null);
    setActingId(id);
    try {
      const res = await fetch(`/api/fabric-receiving/receipts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to advance fabric prep");

      if (data.work_orders?.length > 0) {
        const pieces = data.work_orders.map((order: { piece_name: string }) => order.piece_name).join(" + ");
        setMessage(`Fabric prep complete — split into ${data.work_orders.length} production piece${data.work_orders.length === 1 ? "" : "s"} (${pieces}).`);
        await Promise.all([load(), loadPending(), loadReadyCount()]);
      } else {
        setMessage(`Updated to ${data.receipt.fabric_prep_step ?? "next step"}.`);
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to advance fabric prep");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <AutoSaveStatusBar status={workspaceDraftStatus} isDirty={workspaceDraftDirty} variant="local" />

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-sky-50 p-2 text-sky-600">
            <Package className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900">Receive fabric</h2>
            <p className="mt-1 text-sm text-slate-500">
              Fabric arrives as one cut per order line (e.g. one piece for a full suit). Select what arrived, prepare it,
              then it splits into separate pieces for production.
            </p>
            <form onSubmit={handleReceive} className="mt-4 flex flex-wrap items-end gap-3">
              <label className="block min-w-[280px] flex-1 text-sm">
                <span className="font-medium text-slate-700">Expected fabric</span>
                <select
                  value={selectedLineId}
                  onChange={(e) => setSelectedLineId(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  disabled={pendingLoading}
                >
                  <option value="">
                    {pendingLoading
                      ? "Loading ordered fabric…"
                      : pending.length === 0
                        ? "No fabric waiting to be received"
                        : "Select fabric to receive…"}
                  </option>
                  {pending.map((item) => (
                    <option key={item.sales_order_line_id} value={item.sales_order_line_id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" disabled={receiving || !selectedLineId}>
                {receiving ? "Receiving…" : "Receive fabric"}
              </Button>
            </form>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}
      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      <div>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Queue</h2>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{receivedCount}</p>
            <p className="text-xs font-medium text-slate-600">Awaiting prep</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{prepCount}</p>
            <p className="text-xs font-medium text-slate-600">In fabric prep</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{readyCount}</p>
            <p className="text-xs font-medium text-slate-600">On production floor</p>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : receipts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
          No fabric waiting — select from the list when fabric arrives.
        </p>
      ) : (
        <div className="space-y-3">
          {receipts.map((receipt) => {
            const prepAction =
              receipt.status === "fabric_prep" && receipt.fabric_prep_type && receipt.fabric_prep_step
                ? completeFabricPrepActionLabel(receipt.fabric_prep_type, receipt.fabric_prep_step)
                : null;

            return (
              <div key={receipt.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="md:flex md:items-start md:justify-between md:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{formatReceiptDescription(receipt)}</p>
                    <p className="mt-1 text-sm text-slate-700">{receipt.client_name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {receipt.so_number} · {receipt.supplier_name} {receipt.fabric_number} · {receipt.fabric_meters} m ·
                      received {formatDate(receipt.received_at.slice(0, 10))}
                    </p>
                  </div>
                  <div className="mt-3 md:mt-0 md:shrink-0">
                    <StatusBadge status={receipt.status === "fabric_prep" ? "fabric_prep" : "received"} />
                  </div>
                </div>

                {(receipt.status === "received" || receipt.status === "fabric_prep") && (
                  <div className="space-y-3 border-t border-slate-100 pt-3">
                    <FabricSpecs composition={receipt.composition} weightGsm={receipt.weight_gsm} />

                    {receipt.status === "received" && (
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="block text-sm">
                          <span className="font-medium text-slate-700">Fabric preparation</span>
                          <select
                            value={prepTypeByReceipt[receipt.id] ?? "iron_only"}
                            onChange={(e) =>
                              setPrepTypeByReceipt((prev) => ({
                                ...prev,
                                [receipt.id]: e.target.value as FabricPrepType,
                              }))
                            }
                            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2"
                          >
                            {FABRIC_PREP_TYPES.map((type) => (
                              <option key={type.id} value={type.id}>
                                {type.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <Button size="sm" onClick={() => void startFabricPrep(receipt.id)} disabled={actingId === receipt.id}>
                          {actingId === receipt.id ? "Starting…" : "Start fabric prep"}
                        </Button>
                      </div>
                    )}

                    {receipt.status === "fabric_prep" && receipt.fabric_prep_type && receipt.fabric_prep_step && (
                      <p className="text-sm text-amber-800">
                        {fabricPrepStatusLabel(receipt.fabric_prep_type, receipt.fabric_prep_step)}
                      </p>
                    )}
                  </div>
                )}

                {prepAction && (
                  <div className="border-t border-slate-100 pt-3">
                    <Button size="sm" onClick={() => void advancePrep(receipt.id)} disabled={actingId === receipt.id}>
                      <ArrowRight className="mr-1 h-4 w-4" />
                      {actingId === receipt.id ? "Updating…" : prepAction}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
