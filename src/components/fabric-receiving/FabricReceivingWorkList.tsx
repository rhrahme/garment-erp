"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronRight } from "lucide-react";
import { FabricLineStickerPrintLinks } from "@/components/orders/FabricLineStickerPrintLinks";
import { Button } from "@/components/ui/Button";
import {
  SalesOrderReceivingCutTable,
  type ReceivingCutTableRow,
} from "@/components/orders/SalesOrderReceivingCutTable";
import { ScanStageLegend } from "@/components/production/ScanStageLegend";
import { FabricSwatchProvider } from "@/components/fabric/FabricSwatchProvider";
import {
  FABRIC_PREP_TYPES,
  completeFabricPrepActionLabel,
} from "@/lib/production/fabric-prep";
import { scanStageStyles } from "@/lib/production/scan-stage-highlight";
import type {
  FabricLineReceiveStatus,
  FabricReceivingLineRow,
  FabricReceivingOrderRow,
  FabricReceivingOverview,
} from "@/lib/types/fabric-receipts";
import type { FabricPrepType } from "@/lib/types/production";
import { cn } from "@/lib/utils";

type FabricReceivingWorkTab = "to_receive" | "awaiting_prep" | "in_prep" | "all";

const TABS: { id: FabricReceivingWorkTab; label: string; hint: string }[] = [
  { id: "to_receive", label: "To receive", hint: "Fabric not scanned at Receive yet" },
  { id: "awaiting_prep", label: "Fabric received", hint: "Pink — scanned at Receive" },
  { id: "in_prep", label: "In prep", hint: "Sky blue — wash or iron" },
  { id: "all", label: "All", hint: "Everything on the receiving floor" },
];

function lineMatchesTab(status: FabricLineReceiveStatus, tab: FabricReceivingWorkTab): boolean {
  if (tab === "all") return status !== "handed_off";
  if (tab === "to_receive") return status === "pending";
  if (tab === "awaiting_prep") return status === "received";
  if (tab === "in_prep") return status === "fabric_prep";
  return true;
}

const LINE_STATUS_SORT: Record<FabricLineReceiveStatus, number> = {
  fabric_prep: 0,
  received: 1,
  pending: 2,
  handed_off: 3,
};

type FabricCutEntry = { order: FabricReceivingOrderRow; line: FabricReceivingLineRow };

function sortCutEntries(entries: FabricCutEntry[]): FabricCutEntry[] {
  return [...entries].sort((a, b) => {
    const stage = LINE_STATUS_SORT[a.line.status] - LINE_STATUS_SORT[b.line.status];
    if (stage !== 0) return stage;
    const time = (b.line.updated_at ?? b.line.received_at ?? "").localeCompare(
      a.line.updated_at ?? a.line.received_at ?? ""
    );
    if (time !== 0) return time;
    return a.line.fabric_cut_code.localeCompare(b.line.fabric_cut_code);
  });
}

function formatArticle(articleNumber: number): string {
  return `L${String(articleNumber).padStart(2, "0")}`;
}

function lineToTableRow(line: FabricReceivingLineRow): ReceivingCutTableRow {
  return {
    line_id: line.sales_order_line_id,
    article_number: line.article_number,
    fabric_cut_code: line.fabric_cut_code,
    fabric_number: line.fabric_number,
    supplier_id: line.supplier_id,
    supplier_name: line.supplier_name,
    composition: line.composition,
    weight_gsm: line.weight_gsm,
    width_cm: line.width_cm,
    width_inches: line.width_inches,
    garment_type: line.garment_type,
    fabric_meters: line.fabric_meters,
  };
}

function nextActionForLine(line: FabricReceivingLineRow): string {
  if (line.status === "pending") return "Scan at Receive";
  if (line.status === "received") return "Wash or Iron";
  if (line.status === "fabric_prep" && line.fabric_prep_step === "wash") return "Finish wash";
  if (line.status === "fabric_prep" && line.fabric_prep_step === "soak") return "Finish soak";
  if (line.status === "fabric_prep" && line.fabric_prep_step === "iron") return "Scan at Iron";
  if (line.status === "handed_off") return "In production";
  return "Complete prep";
}

function matchesSearch(entry: FabricCutEntry, query: string): boolean {
  if (!query) return true;
  const q = query.trim().toUpperCase();
  const { order, line } = entry;
  return (
    line.fabric_cut_code.toUpperCase().includes(q) ||
    line.fabric_number.toUpperCase().includes(q) ||
    line.garment_type.toUpperCase().includes(q) ||
    order.so_number.toUpperCase().includes(q) ||
    formatArticle(line.article_number).toUpperCase().includes(q)
  );
}

type FabricReceivingWorkListProps = {
  reloadKey: number;
  tabAfterScan?: FabricReceivingWorkTab | null;
  /** Fabric cuts scanned this session — pinned to top. */
  highlightCutCodes?: string[];
  actingId: string | null;
  prepTypeByReceipt: Record<string, FabricPrepType>;
  onPrepTypeChange: (receiptId: string, type: FabricPrepType) => void;
  onReceiveLine: (salesOrderLineId: string) => void;
  onStartPrep: (receiptId: string) => void;
  onAdvancePrep: (receiptId: string) => void;
};

function ManualLineActions({
  line,
  actingId,
  prepTypeByReceipt,
  onPrepTypeChange,
  onReceiveLine,
  onStartPrep,
  onAdvancePrep,
}: {
  line: FabricReceivingLineRow;
  actingId: string | null;
  prepTypeByReceipt: Record<string, FabricPrepType>;
  onPrepTypeChange: (receiptId: string, type: FabricPrepType) => void;
  onReceiveLine: (salesOrderLineId: string) => void;
  onStartPrep: (receiptId: string) => void;
  onAdvancePrep: (receiptId: string) => void;
}) {
  if (line.status === "pending") {
    return (
      <Button
        size="sm"
        variant="secondary"
        onClick={() => onReceiveLine(line.sales_order_line_id)}
        disabled={actingId === line.sales_order_line_id}
      >
        {actingId === line.sales_order_line_id ? "Receiving…" : "Mark received"}
      </Button>
    );
  }

  if (!line.receipt_id) return null;
  const receiptId = line.receipt_id;

  if (line.status === "received") {
    return (
      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Prep</span>
          <select
            value={prepTypeByReceipt[receiptId] ?? "iron_only"}
            onChange={(e) => onPrepTypeChange(receiptId, e.target.value as FabricPrepType)}
            className="mt-1 block rounded-lg border border-slate-300 px-2 py-1 text-sm"
          >
            {FABRIC_PREP_TYPES.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" onClick={() => onStartPrep(receiptId)} disabled={actingId === receiptId}>
          {actingId === receiptId ? "Starting…" : "Start prep"}
        </Button>
      </div>
    );
  }

  if (line.status === "fabric_prep" && line.fabric_prep_type && line.fabric_prep_step) {
    const advanceLabel =
      completeFabricPrepActionLabel(line.fabric_prep_type, line.fabric_prep_step) ?? "Advance";

    return (
      <Button size="sm" onClick={() => onAdvancePrep(receiptId)} disabled={actingId === receiptId}>
        <ArrowRight className="mr-1 h-4 w-4" />
        {actingId === receiptId ? "Updating…" : advanceLabel}
      </Button>
    );
  }

  return null;
}

function FabricCutCard({
  order,
  line,
  isHighlighted,
  expandedManual,
  onToggleManual,
  actingId,
  prepTypeByReceipt,
  onPrepTypeChange,
  onReceiveLine,
  onStartPrep,
  onAdvancePrep,
}: {
  order: FabricReceivingOrderRow;
  line: FabricReceivingLineRow;
  isHighlighted: boolean;
  expandedManual: boolean;
  onToggleManual: () => void;
  actingId: string | null;
  prepTypeByReceipt: Record<string, FabricPrepType>;
  onPrepTypeChange: (receiptId: string, type: FabricPrepType) => void;
  onReceiveLine: (salesOrderLineId: string) => void;
  onStartPrep: (receiptId: string) => void;
  onAdvancePrep: (receiptId: string) => void;
}) {
  const printHref = `/orders/${order.sales_order_id}/print?team=receiving`;
  const styles = scanStageStyles(line.scan_stage);
  const showManual =
    line.status === "pending" || line.status === "received" || line.status === "fabric_prep";
  const tableRow = lineToTableRow(line);

  return (
    <section
      className={cn(
        "border-b border-slate-200 last:border-0",
        styles.row,
        isHighlighted && "ring-2 ring-inset ring-indigo-400"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Art. {formatArticle(line.article_number)}
            </span>
            <code className="text-xl font-bold tracking-tight text-indigo-900">{line.fabric_cut_code}</code>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", styles.chip)}>
              {line.scan_stage_label}
            </span>
            <span className="text-sm text-slate-700">{nextActionForLine(line)}</span>
            <span className="text-xs text-slate-500">
              {order.so_number} · {order.client_name}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={printHref} target="_blank" rel="noreferrer">
            <Button size="sm" variant="secondary">
              A4 list
            </Button>
          </Link>
          <FabricLineStickerPrintLinks
            orderId={order.sales_order_id}
            lineId={line.sales_order_line_id}
            garmentType={line.garment_type}
            stickerCount={line.stickers.length}
            showCutting={line.status !== "pending"}
          />
          {showManual && (
            <button
              type="button"
              onClick={onToggleManual}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-white/80"
            >
              {expandedManual ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Manual
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto border-t border-slate-100/80 px-4 py-3">
        <SalesOrderReceivingCutTable
          rows={[tableRow]}
          rowClassName={() => "border-b border-slate-200 align-top"}
          rowHighlightClassName={() => styles.row}
        />
      </div>

      {expandedManual && showManual && (
        <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3">
          <ManualLineActions
            line={line}
            actingId={actingId}
            prepTypeByReceipt={prepTypeByReceipt}
            onPrepTypeChange={onPrepTypeChange}
            onReceiveLine={onReceiveLine}
            onStartPrep={onStartPrep}
            onAdvancePrep={onAdvancePrep}
          />
        </div>
      )}
    </section>
  );
}

export function FabricReceivingWorkList({
  reloadKey,
  tabAfterScan,
  highlightCutCodes = [],
  actingId,
  prepTypeByReceipt,
  onPrepTypeChange,
  onReceiveLine,
  onStartPrep,
  onAdvancePrep,
}: FabricReceivingWorkListProps) {
  const [tab, setTab] = useState<FabricReceivingWorkTab>("awaiting_prep");
  const [search, setSearch] = useState("");
  const [overview, setOverview] = useState<FabricReceivingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedManualLine, setExpandedManualLine] = useState<string | null>(null);

  const loadOverview = useCallback(async (showLoading: boolean) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetch(`/api/fabric-receiving/overview?filter=actionable&t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load receiving work");
      const data = (await res.json()) as FabricReceivingOverview;
      setOverview(data);
    } catch {
      if (showLoading) setOverview(null);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview(true);
  }, [loadOverview]);

  useEffect(() => {
    if (reloadKey === 0) return;
    void loadOverview(false);
  }, [reloadKey, loadOverview]);

  useEffect(() => {
    if (tabAfterScan) setTab(tabAfterScan);
  }, [tabAfterScan]);

  const counts = useMemo(() => {
    const lines = overview?.orders.flatMap((order) => order.lines) ?? [];
    return {
      to_receive: lines.filter((line) => line.status === "pending").length,
      awaiting_prep: lines.filter((line) => line.status === "received").length,
      in_prep: lines.filter((line) => line.status === "fabric_prep").length,
      all: lines.length,
    };
  }, [overview]);

  const visibleCuts = useMemo(() => {
    if (!overview) return [];
    const highlightSet = new Set(highlightCutCodes.map((code) => code.toUpperCase()));
    const entries = overview.orders.flatMap((order) =>
      order.lines
        .filter((line) => lineMatchesTab(line.status, tab))
        .map((line) => ({ order, line }))
    );
    const filtered = entries.filter((entry) => matchesSearch(entry, search));
    const sorted = sortCutEntries(filtered);
    if (highlightSet.size === 0) return sorted;

    const pinned: FabricCutEntry[] = [];
    const rest: FabricCutEntry[] = [];
    for (const entry of sorted) {
      if (highlightSet.has(entry.line.fabric_cut_code.toUpperCase())) {
        pinned.push(entry);
      } else {
        rest.push(entry);
      }
    }
    return [...pinned, ...rest];
  }, [overview, tab, search, highlightCutCodes]);

  const swatchFabrics = useMemo(
    () =>
      (overview?.orders ?? []).flatMap((order) =>
        order.lines.map((line) => ({
          supplier_id: line.supplier_id,
          fabric_number: line.fabric_number,
        }))
      ),
    [overview]
  );

  return (
    <FabricSwatchProvider fabrics={swatchFabrics}>
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-900">Work list</h2>
        <p className="mt-1 text-sm text-slate-500">
          Same table as the sales order A4 receiving list — QR, fabric cut, composition, and scan-stage row colour. One
          row per fabric cut.
        </p>

        <label className="mt-4 block">
          <span className="text-sm font-medium text-slate-700">Search fabric cut, article, fabric #, or order</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="FR-0526-0101-L04 or S13022 or L04…"
            className="mt-1 block w-full max-w-xl rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase"
          />
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          {TABS.map((item) => {
            const count = counts[item.id];
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                title={item.hint}
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

        <div className="mt-4">
          <ScanStageLegend />
        </div>
      </div>

      {loading ? (
        <p className="px-5 py-8 text-sm text-slate-500">Loading work list…</p>
      ) : visibleCuts.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">
          {search
            ? `No fabric cuts match “${search}”.`
            : tab === "to_receive"
              ? "Nothing waiting to receive — scan the fabric cut sticker at Receive."
              : tab === "awaiting_prep"
                ? "Nothing fabric received yet — pink rows appear here after scanning."
                : tab === "in_prep"
                  ? "Nothing in prep."
                  : "No open receiving work."}
        </p>
      ) : (
        <div>
          {visibleCuts.map(({ order, line }) => (
            <FabricCutCard
              key={line.sales_order_line_id}
              order={order}
              line={line}
              isHighlighted={highlightCutCodes.some(
                (code) => code.toUpperCase() === line.fabric_cut_code.toUpperCase()
              )}
              expandedManual={expandedManualLine === line.sales_order_line_id}
              onToggleManual={() =>
                setExpandedManualLine((current) =>
                  current === line.sales_order_line_id ? null : line.sales_order_line_id
                )
              }
              actingId={actingId}
              prepTypeByReceipt={prepTypeByReceipt}
              onPrepTypeChange={onPrepTypeChange}
              onReceiveLine={onReceiveLine}
              onStartPrep={onStartPrep}
              onAdvancePrep={onAdvancePrep}
            />
          ))}
        </div>
      )}
    </section>
    </FabricSwatchProvider>
  );
}
