"use client";

import { useCallback, useEffect, useState } from "react";
import {
  scanHighlightForFabricStation,
  scanStageStyles,
} from "@/lib/production/scan-stage-highlight";
import type { ScanStation } from "@/lib/production/stage-scan";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { FabricLabelLookup } from "@/components/fabric-receiving/FabricLabelLookup";
import { FabricReceivingWorkList } from "@/components/fabric-receiving/FabricReceivingWorkList";
import { FabricReceivingTestingReset } from "@/components/fabric-receiving/FabricReceivingTestingReset";
import {
  FabricDefectReportModal,
  type ReportDefectContext,
} from "@/components/fabric-receiving/FabricDefectReportModal";
import { FabricDefectNotices } from "@/components/fabric-receiving/FabricDefectNotices";
import { FabricDefectsTrackingPanel } from "@/components/fabric-receiving/FabricDefectsTrackingPanel";
import {
  FabricTransferModal,
  FabricTransferSuccessBanner,
} from "@/components/orders/FabricTransferModal";
import { StageScanPanel } from "@/components/production/StageScanPanel";
import type { StageScanResponse } from "@/components/production/StickerScanInput";
import {
  fabricPrepTypeLabel,
} from "@/lib/production/fabric-prep";
import type { FabricPrepType } from "@/lib/types/production";
import type { FabricReceivingLineRow, FabricReceivingOrderRow } from "@/lib/types/fabric-receipts";
import type { SalesOrderFabricLine } from "@/lib/types/sales-orders";

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

function receivingLineToFabricLine(line: FabricReceivingLineRow): SalesOrderFabricLine {
  return {
    id: line.sales_order_line_id,
    garment_type: line.garment_type,
    label_count: line.stickers.length,
    label_stickers: line.stickers.map((sticker, index) => ({
      code: sticker.sticker_code,
      piece_name: sticker.piece_name,
      sequence: index + 1,
    })),
    supplier_id: line.supplier_id,
    supplier_name: line.supplier_name,
    fabric_number: line.fabric_number,
    quantity: line.fabric_meters,
    unit: "meters",
    unit_price: 0,
    composition: line.composition,
    weight_gsm: line.weight_gsm,
    width_cm: line.width_cm,
    width_inches: line.width_inches,
    color: null,
  };
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
  const [canChooseDefectFoundAt, setCanChooseDefectFoundAt] = useState(false);
  const [isTaskOperator, setIsTaskOperator] = useState(false);
  const [canTransferFabric, setCanTransferFabric] = useState(false);
  const [defectModal, setDefectModal] = useState<ReportDefectContext | null>(null);
  const [transferTarget, setTransferTarget] = useState<{
    order: FabricReceivingOrderRow;
    line: FabricReceivingLineRow;
  } | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<{
    print_stickers_href: string;
    destination_order_id: string;
    destination_so_number: string;
    admin_alert_message: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        setCanChooseDefectFoundAt(Boolean(data.is_admin || data.is_client_manager));
        setIsTaskOperator(Boolean(data.is_task_operator));
        setCanTransferFabric(Boolean(data.is_admin || data.is_client_manager));
      })
      .catch(() => {
        setCanChooseDefectFoundAt(false);
        setIsTaskOperator(false);
        setCanTransferFabric(false);
      });
  }, []);

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

  async function startFabricPrep(id: string, prepType?: FabricPrepType) {
    const fabric_prep_type = prepType ?? prepTypeByReceipt[id] ?? "iron_only";
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
      setPrepTypeByReceipt((prev) => ({ ...prev, [id]: fabric_prep_type }));
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
        if (receipt?.fabric_prep_step === "drying") {
          setMessage("Hung to dry — tap Start ironing when dry, or scan at Iron.");
        } else if (receipt?.fabric_prep_step === "iron") {
          setMessage("Ironing started — tap Finish prep when done, or scan at Iron.");
        } else {
          setMessage("Prep step updated.");
        }
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
      {transferSuccess ? (
        <FabricTransferSuccessBanner
          printHref={transferSuccess.print_stickers_href}
          destinationSoNumber={transferSuccess.destination_so_number}
          destinationOrderId={transferSuccess.destination_order_id}
          adminAlertMessage={transferSuccess.admin_alert_message}
          onDismiss={() => setTransferSuccess(null)}
        />
      ) : null}

      {transferTarget ? (
        <FabricTransferModal
          open
          sourceOrder={{
            id: transferTarget.order.sales_order_id,
            so_number: transferTarget.order.so_number,
            client_name: transferTarget.order.client_name,
            client_code: transferTarget.order.client_code,
          }}
          sourceLine={receivingLineToFabricLine(transferTarget.line)}
          onClose={() => setTransferTarget(null)}
          onTransferred={(result) => {
            setTransferSuccess(result);
            setTransferTarget(null);
            refreshAll();
          }}
        />
      ) : null}

      <FabricDefectNotices
        reloadKey={reloadKey}
        onMessage={setMessage}
        onError={setError}
        onChanged={refreshAll}
      />

      <FabricLabelLookup
        reloadKey={reloadKey}
        onReceiveLine={handleReceiveLine}
        actingId={actingId}
      />

      <details open className="group rounded-xl border border-slate-200 bg-slate-50/60">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-medium text-slate-700 marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="text-slate-900">Floor scanner</span>
          <span className="ml-2 font-normal text-slate-500">
            — pick Wash / Soak / Iron, then scan (must match the step — Receive alone will not advance prep)
          </span>
        </summary>
        <div className="border-t border-slate-200 px-5 pb-5 pt-4">
          <StageScanPanel
            stations={["receive", "wash", "soak", "iron"]}
            scanContext="fabric-receiving"
            showEmployeeBadge={!isTaskOperator}
            onRefresh={refreshAll}
            onScanMessage={setMessage}
            onScanResult={handleScanResult}
          />
        </div>
      </details>

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
        canChooseDefectFoundAt={canChooseDefectFoundAt}
        onReportDefect={(request) =>
          setDefectModal({
            receiptId: request.receiptId,
            fabricCutCode: request.fabricCutCode,
            fabricNumber: request.fabricNumber,
            soNumber: request.soNumber,
            clientName: request.clientName,
            defaultFoundAt: request.defaultFoundAt,
            allowFoundAtChoice: canChooseDefectFoundAt,
            title: request.title,
          })
        }
        canTransferFabric={canTransferFabric}
        onRequestTransfer={(order, line) => setTransferTarget({ order, line })}
      />

      <FabricDefectsTrackingPanel
        reloadKey={reloadKey}
        onMessage={setMessage}
        onError={setError}
        onChanged={refreshAll}
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

      <FabricDefectReportModal
        open={Boolean(defectModal)}
        context={defectModal}
        onClose={() => setDefectModal(null)}
        onSubmitted={() => {
          setMessage("Defect reported — prep can continue.");
          refreshAll();
        }}
      />
    </div>
  );
}
