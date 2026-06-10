"use client";

import { useCallback, useState } from "react";
import {
  scanHighlightForFabricStation,
  scanStageStyles,
} from "@/lib/production/scan-stage-highlight";
import type { ScanStation } from "@/lib/production/stage-scan";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { FabricReceivingWorkList } from "@/components/fabric-receiving/FabricReceivingWorkList";
import { FabricReceivingTestingReset } from "@/components/fabric-receiving/FabricReceivingTestingReset";
import { StageScanPanel } from "@/components/production/StageScanPanel";
import type { StageScanResponse } from "@/components/production/StickerScanInput";
import {
  fabricPrepTypeLabel,
  completeFabricPrepActionLabel,
} from "@/lib/production/fabric-prep";
import type { FabricPrepType } from "@/lib/types/production";

type SessionScan = {
  id: string;
  scanned_at: string;
  fabric_cut_code: string;
  article_number: number;
  garment_type: string;
  fabric_number: string;
  so_number: string;
  notice?: StageScanResponse["notice"];
  station: ScanStation;
  message: string;
};

function formatArticle(articleNumber: number): string {
  return `L${String(articleNumber).padStart(2, "0")}`;
}

export function FabricReceivingWorkspace() {
  const [reloadKey, setReloadKey] = useState(0);
  const [prepTypeByReceipt, setPrepTypeByReceipt] = useState<Record<string, FabricPrepType>>({});
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tabAfterScan, setTabAfterScan] = useState<
    "to_receive" | "awaiting_prep" | "in_prep" | "all" | null
  >(null);
  const [sessionScans, setSessionScans] = useState<SessionScan[]>([]);

  const refreshAll = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  function handleScanResult(result: StageScanResponse) {
    setTabAfterScan(
      result.notice === "advanced" ||
        result.station === "wash" ||
        result.station === "soak" ||
        result.station === "iron"
        ? "in_prep"
        : result.notice === "created"
          ? "awaiting_prep"
          : "all"
    );
    refreshAll();
    setSessionScans((current) =>
      [
        {
          id: `${Date.now()}-${result.fabric_cut_code}`,
          scanned_at: new Date().toISOString(),
          fabric_cut_code: result.fabric_cut_code,
          article_number: result.article_number,
          garment_type: result.garment_type,
          fabric_number: result.fabric_number,
          so_number: result.so_number,
          notice: result.notice,
          station: result.station,
          message: result.message,
        },
        ...current,
      ].slice(0, 25)
    );
  }

  async function handleReceiveLine(salesOrderLineId: string) {
    setError(null);
    setMessage(null);
    setActingId(salesOrderLineId);
    try {
      const res = await fetch("/api/fabric-receiving/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sales_order_line_id: salesOrderLineId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to receive fabric");
      setMessage(
        data.created
          ? `Received — ${data.garment_description}.`
          : `Already received — ${data.garment_description}.`
      );
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to receive fabric");
    } finally {
      setActingId(null);
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
      setMessage(`Prep started — ${fabricPrepTypeLabel(fabric_prep_type)}.`);
      refreshAll();
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
        setMessage(
          `Handed to production — ${data.work_orders.length} piece${data.work_orders.length === 1 ? "" : "s"} (${pieces}).`
        );
      } else {
        const receipt = data.receipt;
        const action =
          receipt?.fabric_prep_type && receipt?.fabric_prep_step
            ? completeFabricPrepActionLabel(receipt.fabric_prep_type, receipt.fabric_prep_step)
            : null;
        setMessage(action ? `Advanced — ${action.replace(/^Finish → /, "")}` : "Prep step updated.");
      }
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to advance fabric prep");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <StageScanPanel
        stations={["receive", "wash", "soak", "iron"]}
        scanContext="fabric-receiving"
        onRefresh={refreshAll}
        onScanMessage={setMessage}
        onScanResult={handleScanResult}
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}
      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      {sessionScans.length > 0 && (
        <section className="rounded-xl border border-indigo-200 bg-white px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">This session — your scans</h2>
          <p className="mt-1 text-sm text-slate-500">
            Every scan in this session, newest first. Use the fabric cut code to find the row on the work list.
          </p>
          <ul className="mt-3 space-y-2">
            {sessionScans.map((scan) => {
              const stage =
                scan.notice === "created" || scan.notice === "already_received"
                  ? scanStageStyles("received")
                  : scan.station === "receive" ||
                      scan.station === "wash" ||
                      scan.station === "soak" ||
                      scan.station === "iron"
                    ? scanStageStyles(scanHighlightForFabricStation(scan.station))
                    : scanStageStyles("received");
              return (
                <li
                  key={scan.id}
                  className={cn("rounded-lg border px-3 py-2.5", stage.row, "border-slate-200")}
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                      Art. {formatArticle(scan.article_number)}
                    </span>
                    <code className="text-lg font-bold text-indigo-900">{scan.fabric_cut_code}</code>
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {scan.garment_type} · {scan.fabric_number}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {scan.so_number} · {new Date(scan.scanned_at).toLocaleTimeString()}
                  </p>
                  <p className="mt-1 text-xs text-slate-700">{scan.message}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <FabricReceivingWorkList
        reloadKey={reloadKey}
        tabAfterScan={tabAfterScan}
        highlightCutCodes={sessionScans.map((scan) => scan.fabric_cut_code)}
        actingId={actingId}
        prepTypeByReceipt={prepTypeByReceipt}
        onPrepTypeChange={(receiptId, type) =>
          setPrepTypeByReceipt((prev) => ({ ...prev, [receiptId]: type }))
        }
        onReceiveLine={handleReceiveLine}
        onStartPrep={startFabricPrep}
        onAdvancePrep={advancePrep}
      />

      <FabricReceivingTestingReset
        reloadKey={reloadKey}
        onResetComplete={refreshAll}
        onMessage={setMessage}
        onError={setError}
      />

      <p className="text-center text-sm text-slate-500">
        After ironing, pieces move to{" "}
        <Link href="/production" className="font-medium text-indigo-600 hover:text-indigo-800">
          Production
        </Link>
        .{" "}
        <Link href="/production/floor-map" className="font-medium text-indigo-600 hover:text-indigo-800">
          Floor map
        </Link>{" "}
        shows where Receive, Wash, and Iron stations sit.
      </p>
    </div>
  );
}
