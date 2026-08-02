"use client";

import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { GarmentTypeColorLegend } from "@/components/production/GarmentTypeColorLegend";
import { ScanStageLegend } from "@/components/production/ScanStageLegend";
import { StatusBadge } from "@/components/ui/PageHeader";
import { SortableTableHeader } from "@/components/ui/SortableTableHeader";
import { FabricSupplierName } from "@/components/fabric/FabricSupplierName";
import { garmentTypeColorClasses } from "@/lib/production/garment-type-colors";
import {
  productionStageToHighlight,
  scanStageStyles,
  type ScanHighlightStage,
} from "@/lib/production/scan-stage-highlight";
import { formatLabelGarmentDescription } from "@/lib/sales-orders/label-codes";
import { productionBrandNameForOrder } from "@/lib/sales-orders/production-brand";
import type { ProductionWorkOrder } from "@/lib/types/production";
import type { SalesOrder } from "@/lib/types/sales-orders";
import {
  floorActivityNowLabel,
  sewingSessionEmployeeDisplayName,
} from "@/lib/production/sewing-session-status-label";
import type { SewingSession } from "@/lib/types/sewing-sessions";
import {
  applyTableSort,
  compareSortStrings,
  nextTableSort,
  type TableSortState,
} from "@/lib/ui/table-sort";
import { cn } from "@/lib/utils";

type PieceFilter = "all" | "ready" | "in_process" | "done";

type StitchBucket = "ready" | "in_process" | "done" | "not_ready";

type PieceSortKey = "employee" | "article" | "piece" | "fabric" | "stage" | "stitch";

const FILTERS: { id: PieceFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready" },
  { id: "in_process", label: "In process" },
  { id: "done", label: "Done" },
];

const DONE_STAGES = new Set(["washing", "finishing", "packed", "completed"]);

function liveSessionForWorkOrder(
  workOrder: ProductionWorkOrder,
  openSessions: SewingSession[]
): SewingSession | null {
  return (
    openSessions.find(
      (session) =>
        (session.status === "open" || session.status === "closing") &&
        (session.work_order_id === workOrder.id ||
          session.production_code === workOrder.sticker_code ||
          session.scan_code === workOrder.sticker_code)
    ) ?? null
  );
}

function stitchBucket(
  workOrder: ProductionWorkOrder | undefined,
  live: SewingSession | null
): StitchBucket {
  if (live || workOrder?.status === "sewing") return "in_process";
  if (workOrder?.status === "cutting") return "ready";
  if (workOrder && DONE_STAGES.has(workOrder.status)) return "done";
  return "not_ready";
}

function stitchCaption(bucket: StitchBucket, live: SewingSession | null): string | null {
  if (bucket === "ready") return "Ready";
  if (bucket === "in_process") {
    return live ? floorActivityNowLabel(live.job_functions) : "On floor now";
  }
  if (bucket === "done") return "Left";
  return null;
}

function highlightForPiece(
  workOrder: ProductionWorkOrder | undefined,
  live: SewingSession | null
): ScanHighlightStage {
  if (live || workOrder?.status === "sewing") return "sewing";
  if (workOrder) return productionStageToHighlight(workOrder.status);
  return "pending";
}

function garmentSummary(order: SalesOrder): string {
  const types = [
    ...new Set(order.fabric_lines.map((line) => line.garment_type).filter(Boolean)),
  ];
  if (types.length === 0) return "No garments";
  if (types.length <= 3) return types.join(", ");
  return `${types.slice(0, 3).join(", ")} +${types.length - 3}`;
}

function pieceSearchBlob(
  order: SalesOrder,
  wo: ProductionWorkOrder,
  live: SewingSession | null
): string {
  return [
    order.client_name,
    order.client_code,
    order.so_number,
    productionBrandNameForOrder(order),
    wo.garment_type,
    wo.piece_name,
    formatLabelGarmentDescription(wo.garment_type, wo.piece_name),
    wo.sticker_code,
    wo.fabric_number,
    wo.supplier_name,
    live?.employee_name,
    live?.employee_id_number,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function comparePieceRows(
  a: { wo: ProductionWorkOrder; live: SewingSession | null; bucket: StitchBucket },
  b: { wo: ProductionWorkOrder; live: SewingSession | null; bucket: StitchBucket },
  key: PieceSortKey
): number {
  switch (key) {
    case "employee":
      return compareSortStrings(
        a.live ? sewingSessionEmployeeDisplayName(a.live) : "",
        b.live ? sewingSessionEmployeeDisplayName(b.live) : ""
      );
    case "article":
      return compareSortStrings(
        formatLabelGarmentDescription(a.wo.garment_type, a.wo.piece_name),
        formatLabelGarmentDescription(b.wo.garment_type, b.wo.piece_name)
      );
    case "piece":
      return compareSortStrings(a.wo.sticker_code, b.wo.sticker_code);
    case "fabric":
      return compareSortStrings(
        `${a.wo.supplier_name ?? ""} ${a.wo.fabric_number ?? ""}`,
        `${b.wo.supplier_name ?? ""} ${b.wo.fabric_number ?? ""}`
      );
    case "stage":
      return compareSortStrings(
        scanStageStyles(highlightForPiece(a.wo, a.live)).label,
        scanStageStyles(highlightForPiece(b.wo, b.live)).label
      );
    case "stitch":
      return compareSortStrings(
        stitchCaption(a.bucket, a.live) ?? "",
        stitchCaption(b.bucket, b.live) ?? ""
      );
    default:
      return 0;
  }
}

export function StitchOrderBoard({
  order,
  workOrders,
  openSessions,
  onBack,
}: {
  order: SalesOrder;
  workOrders: ProductionWorkOrder[];
  openSessions: SewingSession[];
  onBack: () => void;
}) {
  const [filter, setFilter] = useState<PieceFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<TableSortState<PieceSortKey> | null>(null);

  const pieces = useMemo(() => {
    const forOrder = workOrders
      .filter((wo) => wo.sales_order_id === order.id)
      .sort((a, b) => a.sticker_code.localeCompare(b.sticker_code));

    return forOrder.map((wo) => {
      const live = liveSessionForWorkOrder(wo, openSessions);
      const bucket = stitchBucket(wo, live);
      return { wo, live, bucket };
    });
  }, [order.id, openSessions, workOrders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = pieces.filter((row) => {
      if (filter !== "all" && row.bucket !== filter) return false;
      if (!q) return true;
      return pieceSearchBlob(order, row.wo, row.live).includes(q);
    });
    return applyTableSort(rows, sort, comparePieceRows);
  }, [filter, order, pieces, search, sort]);

  const counts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const scoped = q
      ? pieces.filter((row) => pieceSearchBlob(order, row.wo, row.live).includes(q))
      : pieces;
    const next = { all: scoped.length, ready: 0, in_process: 0, done: 0 };
    for (const row of scoped) {
      if (row.bucket === "ready") next.ready += 1;
      if (row.bucket === "in_process") next.in_process += 1;
      if (row.bucket === "done") next.done += 1;
    }
    return next;
  }, [order, pieces, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="mb-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            All orders
          </button>
          <h2 className="text-xl font-semibold text-slate-900">{order.client_name}</h2>
          <p className="mt-0.5 font-mono text-sm font-semibold text-indigo-800">
            {order.so_number}
            <span className="mx-1.5 font-sans font-normal text-slate-400">/</span>
            <span className="font-sans font-normal text-slate-600">{order.client_code}</span>
          </p>
          <p className="mt-1 text-sm text-slate-600">{garmentSummary(order)}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <ScanStageLegend />
      <GarmentTypeColorLegend />

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Stitch status
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-950">
            Ready
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-900">
            On floor now
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-100 px-2.5 py-1 text-xs font-medium text-cyan-900">
            Left
          </span>
        </div>
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        data-stitch-manual-entry="true"
        placeholder="Search employee, garment, brand, client..."
        className="min-h-[52px] w-full rounded-xl border border-slate-300 px-4 text-base text-slate-900 outline-none ring-indigo-500 focus:ring-2"
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => {
          const active = filter === item.id;
          const count = counts[item.id];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                "min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
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

      {pieces.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
          No production pieces for this order yet - fabric must be received and cut first.
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
          No pieces match this search or filter.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <SortableTableHeader
                  label="Employee"
                  sortKey="employee"
                  activeSortKey={sort?.key ?? null}
                  direction={sort?.direction ?? null}
                  onSort={(key) => setSort((prev) => nextTableSort(prev, key as PieceSortKey))}
                  className="px-3 py-3"
                />
                <SortableTableHeader
                  label="Article"
                  sortKey="article"
                  activeSortKey={sort?.key ?? null}
                  direction={sort?.direction ?? null}
                  onSort={(key) => setSort((prev) => nextTableSort(prev, key as PieceSortKey))}
                  className="px-3 py-3"
                />
                <SortableTableHeader
                  label="Piece"
                  sortKey="piece"
                  activeSortKey={sort?.key ?? null}
                  direction={sort?.direction ?? null}
                  onSort={(key) => setSort((prev) => nextTableSort(prev, key as PieceSortKey))}
                  className="px-3 py-3"
                />
                <SortableTableHeader
                  label="Fabric"
                  sortKey="fabric"
                  activeSortKey={sort?.key ?? null}
                  direction={sort?.direction ?? null}
                  onSort={(key) => setSort((prev) => nextTableSort(prev, key as PieceSortKey))}
                  className="px-3 py-3"
                />
                <SortableTableHeader
                  label="Stage"
                  sortKey="stage"
                  activeSortKey={sort?.key ?? null}
                  direction={sort?.direction ?? null}
                  onSort={(key) => setSort((prev) => nextTableSort(prev, key as PieceSortKey))}
                  className="px-3 py-3"
                />
                <SortableTableHeader
                  label="Stitch"
                  sortKey="stitch"
                  activeSortKey={sort?.key ?? null}
                  direction={sort?.direction ?? null}
                  onSort={(key) => setSort((prev) => nextTableSort(prev, key as PieceSortKey))}
                  className="px-3 py-3"
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(({ wo, live, bucket }) => {
                const stage = highlightForPiece(wo, live);
                const styles = scanStageStyles(stage);
                const caption = stitchCaption(bucket, live);
                const articleLabel = formatLabelGarmentDescription(wo.garment_type, wo.piece_name);
                const articleColor = garmentTypeColorClasses(
                  wo.piece_name?.trim() || wo.garment_type || articleLabel
                );
                return (
                  <tr key={wo.id} className={cn("text-slate-800", styles.row)}>
                    <td className="px-3 py-3">
                      {live ? (
                        <div>
                          <div className="font-medium text-emerald-800">
                            {sewingSessionEmployeeDisplayName(live)}
                          </div>
                          {live.status === "closing" ? (
                            <div className="text-xs text-slate-500">closing</div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className={cn("px-3 py-3", articleColor.bg)}>
                      <span className={cn("font-semibold", articleColor.text)}>
                        {articleLabel}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs font-semibold text-indigo-800 sm:text-sm">
                      {wo.sticker_code}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600 sm:text-sm">
                      <FabricSupplierName
                        supplierId={wo.supplier_id}
                        supplierName={wo.supplier_name}
                        fabricNumber={wo.fabric_number}
                      />{" "}
                      {wo.fabric_number}
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", styles.chip)}>
                        {styles.label}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {caption ? (
                        <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-semibold text-slate-800 ring-1 ring-slate-200">
                          {caption}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
