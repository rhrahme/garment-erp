"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { GarmentTypeColorLegend } from "@/components/production/GarmentTypeColorLegend";
import ScanQrSvg from "@/components/production/ScanQrSvg";
import { StitchKioskPanel } from "@/components/production/StitchKioskPanel";
import { StitchOrdersPanel } from "@/components/production/StitchOrdersPanel";
import {
  StitchScanCaptureProvider,
  StitchScanFeedbackBanner,
  StitchScannerReadyBadge,
} from "@/components/production/stitch-scan-capture";
import { SortableTableHeader } from "@/components/ui/SortableTableHeader";
import { garmentTypeColorClasses } from "@/lib/production/garment-type-colors";
import { sewingSessionArticleLabel } from "@/lib/production/sewing-session-article-label";
import {
  SEWING_LIVE_LONG_RUNNING_SEC,
  sewingSessionElapsedSec,
  type SewingDashboardPeriod,
  type SewingEmployeeAggregate,
} from "@/lib/production/sewing-session-state";
import {
  sewingSessionClientDisplayName,
  sewingSessionEmployeeDisplayName,
  sewingSessionScanQrLabel,
  sewingSessionStatusLabel,
} from "@/lib/production/sewing-session-status-label";
import type { SewingScanFailure } from "@/lib/types/sewing-scan-failures";
import type { SewingSession } from "@/lib/types/sewing-sessions";
import {
  applyTableSort,
  compareSortNumbers,
  compareSortStrings,
  nextTableSort,
  type TableSortState,
} from "@/lib/ui/table-sort";
import { cn } from "@/lib/utils";

type FloorTab = "scan" | "orders" | "live" | "performance" | "history";
type HistoryMode = "sessions" | "failures";

type LiveSortKey =
  | "employee"
  | "article"
  | "scan"
  | "client"
  | "started"
  | "elapsed"
  | "status";

type HistorySortKey =
  | "employee"
  | "article"
  | "scan"
  | "client"
  | "start"
  | "end"
  | "duration"
  | "status";

type FailureSortKey =
  | "when"
  | "kind"
  | "code"
  | "reason"
  | "employee"
  | "kiosk"
  | "piece";

const FLOOR_TABS = new Set<FloorTab>(["scan", "orders", "live", "performance", "history"]);

function tabFromLocation(
  pathname: string,
  searchTab: string | null,
  initialTab: FloorTab
): FloorTab {
  if (pathname === "/stitch/orders" || pathname.startsWith("/stitch/orders/")) {
    return "orders";
  }
  if (searchTab && FLOOR_TABS.has(searchTab as FloorTab)) {
    return searchTab as FloorTab;
  }
  return initialTab;
}

type DashboardPayload = {
  period: SewingDashboardPeriod;
  period_from: string;
  period_to: string;
  open_sessions: SewingSession[];
  closed_today: number;
  closed_in_period: number;
  completed_by_employee: SewingEmployeeAggregate[];
  today_by_employee?: SewingEmployeeAggregate[];
  sessions: SewingSession[];
  failed_scans?: SewingScanFailure[];
  failed_scans_in_period?: number;
};

const TABS: { id: FloorTab; label: string }[] = [
  { id: "scan", label: "Scan" },
  { id: "live", label: "Live" },
  { id: "performance", label: "Performance" },
  { id: "history", label: "History" },
];

const PERIODS: { id: SewingDashboardPeriod; label: string; hint: string }[] = [
  { id: "day", label: "Daily", hint: "Today (local midnight)" },
  { id: "week", label: "Weekly", hint: "Calendar week Mon-Sun" },
  { id: "month", label: "Monthly", hint: "Current calendar month" },
];

function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "-";
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatElapsed(startedAt: string, now: number): string {
  const sec = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  return formatDuration(sec);
}

function formatClock(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sessionSearchBlob(row: SewingSession): string {
  return [
    sewingSessionEmployeeDisplayName(row),
    row.employee_name,
    row.employee_short_name,
    row.employee_id_number,
    row.production_code,
    row.scan_code,
    sewingSessionScanQrLabel(row),
    row.so_number,
    row.client_name,
    row.client_short_name,
    sewingSessionClientDisplayName(row, ""),
    row.piece_mark,
    row.fabric_cut_code,
    row.garment_type,
    sewingSessionArticleLabel(row),
    row.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function failureSearchBlob(row: SewingScanFailure): string {
  return [
    row.employee_name,
    row.employee_id_number,
    row.raw_code,
    row.reason,
    row.reason_code,
    row.scan_kind,
    row.kiosk_id,
    row.related_production_code,
    row.arm_employee_name,
    row.phase,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function compareLiveSessions(
  a: SewingSession,
  b: SewingSession,
  key: LiveSortKey,
  now: number
): number {
  switch (key) {
    case "employee":
      return compareSortStrings(
        sewingSessionEmployeeDisplayName(a),
        sewingSessionEmployeeDisplayName(b)
      );
    case "article":
      return compareSortStrings(sewingSessionArticleLabel(a), sewingSessionArticleLabel(b));
    case "scan":
      return compareSortStrings(sewingSessionScanQrLabel(a), sewingSessionScanQrLabel(b));
    case "client":
      return compareSortStrings(
        `${a.so_number ?? ""} ${sewingSessionClientDisplayName(a, "")}`,
        `${b.so_number ?? ""} ${sewingSessionClientDisplayName(b, "")}`
      );
    case "started":
      return compareSortNumbers(new Date(a.started_at).getTime(), new Date(b.started_at).getTime());
    case "elapsed":
      return compareSortNumbers(
        sewingSessionElapsedSec(a.started_at, now),
        sewingSessionElapsedSec(b.started_at, now)
      );
    case "status":
      return compareSortStrings(
        sewingSessionStatusLabel(a.status, a.job_functions),
        sewingSessionStatusLabel(b.status, b.job_functions)
      );
    default:
      return 0;
  }
}

function compareHistorySessions(a: SewingSession, b: SewingSession, key: HistorySortKey): number {
  switch (key) {
    case "employee":
      return compareSortStrings(
        sewingSessionEmployeeDisplayName(a),
        sewingSessionEmployeeDisplayName(b)
      );
    case "article":
      return compareSortStrings(sewingSessionArticleLabel(a), sewingSessionArticleLabel(b));
    case "scan":
      return compareSortStrings(sewingSessionScanQrLabel(a), sewingSessionScanQrLabel(b));
    case "client":
      return compareSortStrings(
        `${a.so_number ?? ""} ${sewingSessionClientDisplayName(a, "")}`,
        `${b.so_number ?? ""} ${sewingSessionClientDisplayName(b, "")}`
      );
    case "start":
      return compareSortNumbers(new Date(a.started_at).getTime(), new Date(b.started_at).getTime());
    case "end":
      return compareSortNumbers(
        a.ended_at ? new Date(a.ended_at).getTime() : null,
        b.ended_at ? new Date(b.ended_at).getTime() : null
      );
    case "duration":
      return compareSortNumbers(a.duration_sec, b.duration_sec);
    case "status":
      return compareSortStrings(
        sewingSessionStatusLabel(a.status, a.job_functions),
        sewingSessionStatusLabel(b.status, b.job_functions)
      );
    default:
      return 0;
  }
}

function compareFailures(a: SewingScanFailure, b: SewingScanFailure, key: FailureSortKey): number {
  switch (key) {
    case "when":
      return compareSortNumbers(new Date(a.scanned_at).getTime(), new Date(b.scanned_at).getTime());
    case "kind":
      return compareSortStrings(a.scan_kind ?? "", b.scan_kind ?? "");
    case "code":
      return compareSortStrings(a.raw_code ?? "", b.raw_code ?? "");
    case "reason":
      return compareSortStrings(a.reason ?? "", b.reason ?? "");
    case "employee":
      return compareSortStrings(
        a.employee_name || a.arm_employee_name || "",
        b.employee_name || b.arm_employee_name || ""
      );
    case "kiosk":
      return compareSortStrings(a.kiosk_id ?? "", b.kiosk_id ?? "");
    case "piece":
      return compareSortStrings(a.related_production_code ?? "", b.related_production_code ?? "");
    default:
      return 0;
  }
}

export function StitchFloorWorkspace({
  initialTab = "scan",
}: {
  /** Preferred when URL does not already select a tab (`/stitch/orders` or `?tab=`). */
  initialTab?: FloorTab;
} = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<FloorTab>(() =>
    tabFromLocation(pathname, searchParams.get("tab"), initialTab)
  );
  const [period, setPeriod] = useState<SewingDashboardPeriod>("day");
  const [historyMode, setHistoryMode] = useState<HistoryMode>("sessions");
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [liveSort, setLiveSort] = useState<TableSortState<LiveSortKey> | null>({
    key: "elapsed",
    direction: "desc",
  });
  const [historySort, setHistorySort] = useState<TableSortState<HistorySortKey> | null>(null);
  const [failureSort, setFailureSort] = useState<TableSortState<FailureSortKey> | null>(null);

  useEffect(() => {
    setTab(tabFromLocation(pathname, searchParams.get("tab"), initialTab));
  }, [pathname, searchParams, initialTab]);

  const selectTab = useCallback(
    (next: FloorTab) => {
      setTab(next);
      // Orders lives only in left-nav at `/stitch/orders`; floor tabs stay on `/stitch`.
      if (pathname === "/stitch/orders" || pathname.startsWith("/stitch/orders/")) {
        router.replace("/stitch");
      }
    },
    [pathname, router]
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/production/sewing-session?period=${period}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load sewing sessions");
      setData(json as DashboardPayload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sewing sessions");
    }
  }, [period]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 12_000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setExpandedEmployeeId(null);
  }, [period]);

  useEffect(() => {
    setSearch("");
  }, [historyMode]);

  const periodHint = PERIODS.find((row) => row.id === period)?.hint ?? "";

  const liveRows = useMemo(() => {
    const rows = data?.open_sessions ?? [];
    return applyTableSort(rows, liveSort, (a, b, key) => compareLiveSessions(a, b, key, now));
  }, [data?.open_sessions, liveSort, now]);

  const historyRows = useMemo(() => {
    const rows = data?.sessions ?? [];
    const q = search.trim().toLowerCase();
    const filtered = q ? rows.filter((row) => sessionSearchBlob(row).includes(q)) : rows;
    return applyTableSort(filtered, historySort, compareHistorySessions);
  }, [data?.sessions, historySort, search]);

  const failureRows = useMemo(() => {
    const rows = data?.failed_scans ?? [];
    const q = search.trim().toLowerCase();
    const filtered = q ? rows.filter((row) => failureSearchBlob(row).includes(q)) : rows;
    return applyTableSort(filtered, failureSort, compareFailures);
  }, [data?.failed_scans, failureSort, search]);

  const piecesByEmployee = useMemo(() => {
    const map = new Map<string, SewingSession[]>();
    for (const row of data?.sessions ?? []) {
      if (row.status !== "closed") continue;
      const list = map.get(row.employee_id) ?? [];
      list.push(row);
      map.set(row.employee_id, list);
    }
    return map;
  }, [data?.sessions]);

  return (
    <StitchScanCaptureProvider rearmKey={tab}>
      <div className="flex min-h-[calc(100vh-5.5rem)] w-full flex-col gap-4">
        <div className="sticky top-0 z-10 -mx-1 border-b border-slate-200 bg-slate-50/95 px-1 pb-3 pt-1 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            {TABS.map((item) => {
              const active = tab === item.id;
              const badge =
                item.id === "live"
                  ? data?.open_sessions.length
                  : item.id === "performance"
                    ? data?.closed_in_period
                    : item.id === "history"
                      ? data?.sessions.length
                      : null;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectTab(item.id)}
                  className={cn(
                    "min-h-[52px] min-w-[96px] flex-1 rounded-xl px-4 py-3 text-base font-semibold transition-colors sm:flex-none",
                    active
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                  )}
                >
                  {item.label}
                  {badge != null && (
                    <span
                      className={cn(
                        "ml-2 tabular-nums",
                        active ? "text-indigo-100" : "text-slate-500"
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
            <StitchScannerReadyBadge className="ml-auto" />
          </div>
          <StitchScanFeedbackBanner
            className="mt-3"
            onScanSettled={() => {
              void load();
            }}
          />
        </div>

        {error && tab !== "scan" && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {tab === "scan" && (
          <div className="mx-auto w-full max-w-5xl flex-1">
            <StitchKioskPanel />
          </div>
        )}

        {tab === "orders" && (
          <div className="mx-auto w-full max-w-6xl flex-1">
            <StitchOrdersPanel openSessions={data?.open_sessions ?? []} />
          </div>
        )}

      {tab === "live" && (
        <div className="space-y-4">
        <GarmentTypeColorLegend />
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Who is on the floor now</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Open sessions across kiosks. Status follows each employee job (Cutting, Sewing,
                  Wash / iron, ...). Refresh every 12s. Red elapsed = over 45 min.
                </p>
              </div>
              {data && (
                <p className="text-sm font-semibold tabular-nums text-slate-700">
                  {data.open_sessions.filter((s) => s.status === "open").length} open
                  {" / "}
                  {data.open_sessions.filter((s) => s.status === "closing").length} closing
                </p>
              )}
            </div>
          </div>
          <div className="overflow-x-auto p-2 sm:p-4">
            {!data ? (
              <p className="px-3 py-4 text-base text-slate-500">Loading...</p>
            ) : liveRows.length === 0 ? (
              <p className="px-3 py-4 text-base text-slate-500">No one on the floor right now.</p>
            ) : (
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3 text-left font-semibold">QR</th>
                    <SortableTableHeader
                      label="Employee"
                      sortKey="employee"
                      activeSortKey={liveSort?.key ?? null}
                      direction={liveSort?.direction ?? null}
                      onSort={(key) => setLiveSort((prev) => nextTableSort(prev, key as LiveSortKey))}
                      className="px-3 py-3"
                    />
                    <SortableTableHeader
                      label="Article"
                      sortKey="article"
                      activeSortKey={liveSort?.key ?? null}
                      direction={liveSort?.direction ?? null}
                      onSort={(key) => setLiveSort((prev) => nextTableSort(prev, key as LiveSortKey))}
                      className="px-3 py-3"
                    />
                    <SortableTableHeader
                      label="Scan QR"
                      sortKey="scan"
                      activeSortKey={liveSort?.key ?? null}
                      direction={liveSort?.direction ?? null}
                      onSort={(key) => setLiveSort((prev) => nextTableSort(prev, key as LiveSortKey))}
                      className="px-3 py-3"
                    />
                    <SortableTableHeader
                      label="SO / Client"
                      sortKey="client"
                      activeSortKey={liveSort?.key ?? null}
                      direction={liveSort?.direction ?? null}
                      onSort={(key) => setLiveSort((prev) => nextTableSort(prev, key as LiveSortKey))}
                      className="px-3 py-3"
                    />
                    <SortableTableHeader
                      label="Started"
                      sortKey="started"
                      activeSortKey={liveSort?.key ?? null}
                      direction={liveSort?.direction ?? null}
                      onSort={(key) => setLiveSort((prev) => nextTableSort(prev, key as LiveSortKey))}
                      className="px-3 py-3"
                    />
                    <SortableTableHeader
                      label="Elapsed"
                      sortKey="elapsed"
                      activeSortKey={liveSort?.key ?? null}
                      direction={liveSort?.direction ?? null}
                      onSort={(key) => setLiveSort((prev) => nextTableSort(prev, key as LiveSortKey))}
                      className="px-3 py-3"
                    />
                    <SortableTableHeader
                      label="Status"
                      sortKey="status"
                      activeSortKey={liveSort?.key ?? null}
                      direction={liveSort?.direction ?? null}
                      onSort={(key) => setLiveSort((prev) => nextTableSort(prev, key as LiveSortKey))}
                      className="px-3 py-3"
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {liveRows.map((session) => {
                    const elapsedSec = sewingSessionElapsedSec(session.started_at, now);
                    const longRunning = elapsedSec >= SEWING_LIVE_LONG_RUNNING_SEC;
                    const today =
                      data.today_by_employee?.find((row) => row.employee_id === session.employee_id) ??
                      null;
                    const article = sewingSessionArticleLabel(session);
                    const articleColor = garmentTypeColorClasses(article || null);
                    const scanQr = sewingSessionScanQrLabel(session);
                    return (
                      <tr
                        key={session.id}
                        className={cn("text-slate-800", longRunning && "bg-red-50/60")}
                      >
                        <td className="px-3 py-3">
                          <ScanQrSvg value={scanQr} sizePx={60} className="rounded border border-slate-200" />
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-slate-900">
                            {sewingSessionEmployeeDisplayName(session)}
                          </div>
                          {session.employee_id_number ? (
                            <div className="font-mono text-xs text-slate-500">
                              ID {session.employee_id_number}
                            </div>
                          ) : null}
                          {today && today.count > 0 ? (
                            <div className="mt-1 text-xs text-slate-500">
                              Today: {today.count} pcs / {formatDuration(today.duration_sec)}
                            </div>
                          ) : (
                            <div className="mt-1 text-xs text-slate-400">Today: first piece</div>
                          )}
                        </td>
                        <td className={cn("px-3 py-3", articleColor.bg)}>
                          <span className={cn("font-semibold", articleColor.text)}>
                            {article || "-"}
                          </span>
                          {session.piece_mark ? (
                            <div className="text-xs text-slate-500">{session.piece_mark}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 font-mono text-sm tracking-normal whitespace-nowrap">
                          {scanQr}
                        </td>
                        <td className="px-3 py-3">
                          <div>{session.so_number || "-"}</div>
                          <div className="text-slate-500">
                            {sewingSessionClientDisplayName(session)}
                          </div>
                          {session.fabric_number ? (
                            <div className="text-xs text-slate-500">fabric {session.fabric_number}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div>{formatClock(session.started_at)}</div>
                          {session.workstation_id || session.kiosk_id ? (
                            <div className="text-xs text-slate-500">
                              {[session.workstation_id, session.kiosk_id].filter(Boolean).join(" / ")}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <div
                            className={cn(
                              "text-lg font-semibold tabular-nums",
                              longRunning ? "text-red-700" : "text-slate-900"
                            )}
                          >
                            {formatElapsed(session.started_at, now)}
                          </div>
                          {longRunning ? (
                            <div className="mt-1 text-xs font-semibold text-red-800">Long running</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={cn(
                              "rounded-lg px-2.5 py-1 text-xs font-semibold",
                              session.status === "closing"
                                ? "bg-sky-100 text-sky-800"
                                : "bg-emerald-100 text-emerald-800"
                            )}
                          >
                            {sewingSessionStatusLabel(session.status, session.job_functions)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
        </div>
      )}

      {(tab === "performance" || tab === "history") && (
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((item) => {
            const active = period === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPeriod(item.id)}
                className={cn(
                  "min-h-[48px] rounded-xl px-4 py-2.5 text-base font-semibold transition-colors",
                  active
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                )}
              >
                {item.label}
              </button>
            );
          })}
          <p className="w-full text-sm text-slate-500 sm:ml-2 sm:w-auto">{periodHint}</p>
        </div>
      )}

      {tab === "performance" && (
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-xl font-semibold text-slate-900">Employee performance</h2>
            <p className="mt-1 text-sm text-slate-500">
              Closed sessions only. Pieces, total time, avg per piece.
              {data ? ` ${data.closed_in_period} pieces in period.` : ""}
            </p>
          </div>
          <div className="p-4 sm:p-5">
            {!data ? (
              <p className="text-base text-slate-500">Loading...</p>
            ) : data.completed_by_employee.length === 0 ? (
              <p className="text-base text-slate-500">No closed pieces in this period.</p>
            ) : (
              <ul className="space-y-3">
                {data.completed_by_employee.map((row) => {
                  const expanded = expandedEmployeeId === row.employee_id;
                  const pieces = piecesByEmployee.get(row.employee_id) ?? [];
                  return (
                    <li
                      key={row.employee_id}
                      className="rounded-xl border border-slate-200 bg-slate-50/60"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedEmployeeId(expanded ? null : row.employee_id)
                        }
                        className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-4 text-left"
                      >
                        <div className="min-w-0 space-y-1">
                          <p className="text-lg font-semibold text-slate-900">{row.employee_name}</p>
                          {(row.articles?.length ?? 0) > 0 ? (
                            <p className="text-base font-semibold text-slate-800">
                              {row.articles.join(" / ")}
                            </p>
                          ) : null}
                          <p className="text-sm text-slate-500">
                            Tap to {expanded ? "hide" : "show"} pieces (Scan QR + times)
                          </p>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <p className="text-2xl font-semibold tabular-nums text-slate-900">
                              {row.count}
                            </p>
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                              Pieces
                            </p>
                          </div>
                          <div>
                            <p className="text-lg font-semibold tabular-nums text-slate-900">
                              {formatDuration(row.duration_sec)}
                            </p>
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                              Total
                            </p>
                          </div>
                          <div>
                            <p className="text-lg font-semibold tabular-nums text-slate-900">
                              {formatDuration(row.avg_duration_sec)}
                            </p>
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                              Avg
                            </p>
                          </div>
                        </div>
                      </button>
                      {expanded && (
                        <ul className="border-t border-slate-200 bg-white px-4 py-2">
                          {pieces.length === 0 ? (
                            <li className="py-3 text-sm text-slate-500">No piece rows loaded.</li>
                          ) : (
                            pieces.map((piece) => {
                              const article = sewingSessionArticleLabel(piece);
                              const articleColor = garmentTypeColorClasses(article || null);
                              const scanQr = sewingSessionScanQrLabel(piece);
                              return (
                              <li
                                key={piece.id}
                                className={cn(
                                  "flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-3 last:border-b-0",
                                  articleColor.bg
                                )}
                              >
                                <div className="flex min-w-0 items-center gap-3 px-1">
                                  <ScanQrSvg
                                    value={scanQr}
                                    sizePx={56}
                                    className="shrink-0 rounded border border-slate-200"
                                  />
                                  <div className="min-w-0 space-y-0.5">
                                  <p className={cn("text-base font-semibold", articleColor.text)}>
                                    {article || "-"}
                                    {piece.piece_mark ? (
                                      <span className="ml-2 text-sm font-normal text-slate-500">
                                        {piece.piece_mark}
                                      </span>
                                    ) : null}
                                  </p>
                                  <p className="font-mono text-sm font-medium tracking-normal text-slate-800 whitespace-nowrap">
                                    {scanQr}
                                  </p>
                                  <p className="text-sm text-slate-500">
                                    {sewingSessionClientDisplayName(piece)}
                                    {piece.so_number ? ` / ${piece.so_number}` : ""}
                                  </p>
                                  </div>
                                </div>
                                <div className="px-1 text-right text-sm">
                                  <p className="tabular-nums font-semibold text-slate-800">
                                    {formatDuration(piece.duration_sec)}
                                  </p>
                                  <p className="text-slate-500">{formatClock(piece.ended_at)}</p>
                                </div>
                              </li>
                              );
                            })
                          )}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      )}

      {tab === "history" && (
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  {historyMode === "sessions" ? "Session history" : "Failed scans"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {historyMode === "sessions"
                    ? "Closed in period plus open sessions. Search employee, article, Scan QR, SO, or client."
                    : "Rejected badge/A4 scans in period. Use for QC sequence reconstruction."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setHistoryMode("sessions")}
                  className={cn(
                    "min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                    historyMode === "sessions"
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                  )}
                >
                  Sessions
                  {data ? (
                    <span className="ml-2 tabular-nums opacity-80">{data.sessions.length}</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryMode("failures")}
                  className={cn(
                    "min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                    historyMode === "failures"
                      ? "bg-red-700 text-white"
                      : "bg-white text-red-800 ring-1 ring-red-200 hover:bg-red-50"
                  )}
                >
                  Failed scans
                  {data ? (
                    <span className="ml-2 tabular-nums opacity-80">
                      {data.failed_scans_in_period ?? 0}
                    </span>
                  ) : null}
                </button>
              </div>
            </div>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-stitch-manual-entry="true"
              placeholder={
                historyMode === "sessions"
                  ? "Search employee, article, Scan QR, SO, client..."
                  : "Search employee, code, reason, kiosk..."
              }
              className="mt-4 min-h-[52px] w-full rounded-xl border border-slate-300 px-4 text-base text-slate-900 outline-none ring-indigo-500 focus:ring-2"
            />
          </div>
          <div className="overflow-x-auto p-2 sm:p-4">
            {!data ? (
              <p className="px-3 py-4 text-base text-slate-500">Loading...</p>
            ) : historyMode === "sessions" ? (
              historyRows.length === 0 ? (
                <p className="px-3 py-4 text-base text-slate-500">No sessions match.</p>
              ) : (
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3 text-left font-semibold">QR</th>
                      <SortableTableHeader
                        label="Employee"
                        sortKey="employee"
                        activeSortKey={historySort?.key ?? null}
                        direction={historySort?.direction ?? null}
                        onSort={(key) =>
                          setHistorySort((prev) => nextTableSort(prev, key as HistorySortKey))
                        }
                        className="px-3 py-3"
                      />
                      <SortableTableHeader
                        label="Article"
                        sortKey="article"
                        activeSortKey={historySort?.key ?? null}
                        direction={historySort?.direction ?? null}
                        onSort={(key) =>
                          setHistorySort((prev) => nextTableSort(prev, key as HistorySortKey))
                        }
                        className="px-3 py-3"
                      />
                      <SortableTableHeader
                        label="Scan QR"
                        sortKey="scan"
                        activeSortKey={historySort?.key ?? null}
                        direction={historySort?.direction ?? null}
                        onSort={(key) =>
                          setHistorySort((prev) => nextTableSort(prev, key as HistorySortKey))
                        }
                        className="px-3 py-3"
                      />
                      <SortableTableHeader
                        label="SO / Client"
                        sortKey="client"
                        activeSortKey={historySort?.key ?? null}
                        direction={historySort?.direction ?? null}
                        onSort={(key) =>
                          setHistorySort((prev) => nextTableSort(prev, key as HistorySortKey))
                        }
                        className="px-3 py-3"
                      />
                      <SortableTableHeader
                        label="Start"
                        sortKey="start"
                        activeSortKey={historySort?.key ?? null}
                        direction={historySort?.direction ?? null}
                        onSort={(key) =>
                          setHistorySort((prev) => nextTableSort(prev, key as HistorySortKey))
                        }
                        className="px-3 py-3"
                      />
                      <SortableTableHeader
                        label="End"
                        sortKey="end"
                        activeSortKey={historySort?.key ?? null}
                        direction={historySort?.direction ?? null}
                        onSort={(key) =>
                          setHistorySort((prev) => nextTableSort(prev, key as HistorySortKey))
                        }
                        className="px-3 py-3"
                      />
                      <SortableTableHeader
                        label="Duration"
                        sortKey="duration"
                        activeSortKey={historySort?.key ?? null}
                        direction={historySort?.direction ?? null}
                        onSort={(key) =>
                          setHistorySort((prev) => nextTableSort(prev, key as HistorySortKey))
                        }
                        className="px-3 py-3"
                      />
                      <SortableTableHeader
                        label="Status"
                        sortKey="status"
                        activeSortKey={historySort?.key ?? null}
                        direction={historySort?.direction ?? null}
                        onSort={(key) =>
                          setHistorySort((prev) => nextTableSort(prev, key as HistorySortKey))
                        }
                        className="px-3 py-3"
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyRows.map((row) => {
                      const article = sewingSessionArticleLabel(row);
                      const articleColor = garmentTypeColorClasses(article || null);
                      const scanQr = sewingSessionScanQrLabel(row);
                      return (
                      <tr key={row.id} className="text-slate-800">
                        <td className="px-3 py-3">
                          <ScanQrSvg value={scanQr} sizePx={60} className="rounded border border-slate-200" />
                        </td>
                        <td className="px-3 py-3 font-medium">
                          {sewingSessionEmployeeDisplayName(row)}
                        </td>
                        <td className={cn("px-3 py-3", articleColor.bg)}>
                          <div className={cn("font-semibold", articleColor.text)}>
                            {article || "-"}
                          </div>
                          {row.piece_mark ? (
                            <div className="text-xs text-slate-500">{row.piece_mark}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 font-mono text-sm tracking-normal whitespace-nowrap">
                          {scanQr}
                        </td>
                        <td className="px-3 py-3">
                          <div>{row.so_number || "-"}</div>
                          <div className="text-slate-500">
                            {sewingSessionClientDisplayName(row, "-")}
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {formatClock(row.started_at)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {formatClock(row.ended_at)}
                        </td>
                        <td className="px-3 py-3 tabular-nums font-semibold">
                          {row.status === "closed"
                            ? formatDuration(row.duration_sec)
                            : formatElapsed(row.started_at, now)}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={cn(
                              "rounded-lg px-2.5 py-1 text-xs font-semibold",
                              row.status === "closed"
                                ? "bg-slate-100 text-slate-700"
                                : row.status === "closing"
                                  ? "bg-sky-100 text-sky-800"
                                  : "bg-emerald-100 text-emerald-800"
                            )}
                          >
                            {sewingSessionStatusLabel(row.status, row.job_functions)}
                          </span>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            ) : failureRows.length === 0 ? (
              <p className="px-3 py-4 text-base text-slate-500">No failed scans in this period.</p>
            ) : (
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <SortableTableHeader
                      label="When"
                      sortKey="when"
                      activeSortKey={failureSort?.key ?? null}
                      direction={failureSort?.direction ?? null}
                      onSort={(key) =>
                        setFailureSort((prev) => nextTableSort(prev, key as FailureSortKey))
                      }
                      className="px-3 py-3"
                    />
                    <SortableTableHeader
                      label="Kind"
                      sortKey="kind"
                      activeSortKey={failureSort?.key ?? null}
                      direction={failureSort?.direction ?? null}
                      onSort={(key) =>
                        setFailureSort((prev) => nextTableSort(prev, key as FailureSortKey))
                      }
                      className="px-3 py-3"
                    />
                    <SortableTableHeader
                      label="Code"
                      sortKey="code"
                      activeSortKey={failureSort?.key ?? null}
                      direction={failureSort?.direction ?? null}
                      onSort={(key) =>
                        setFailureSort((prev) => nextTableSort(prev, key as FailureSortKey))
                      }
                      className="px-3 py-3"
                    />
                    <SortableTableHeader
                      label="Reason"
                      sortKey="reason"
                      activeSortKey={failureSort?.key ?? null}
                      direction={failureSort?.direction ?? null}
                      onSort={(key) =>
                        setFailureSort((prev) => nextTableSort(prev, key as FailureSortKey))
                      }
                      className="px-3 py-3"
                    />
                    <SortableTableHeader
                      label="Employee / Arm"
                      sortKey="employee"
                      activeSortKey={failureSort?.key ?? null}
                      direction={failureSort?.direction ?? null}
                      onSort={(key) =>
                        setFailureSort((prev) => nextTableSort(prev, key as FailureSortKey))
                      }
                      className="px-3 py-3"
                    />
                    <SortableTableHeader
                      label="Kiosk"
                      sortKey="kiosk"
                      activeSortKey={failureSort?.key ?? null}
                      direction={failureSort?.direction ?? null}
                      onSort={(key) =>
                        setFailureSort((prev) => nextTableSort(prev, key as FailureSortKey))
                      }
                      className="px-3 py-3"
                    />
                    <SortableTableHeader
                      label="Related piece"
                      sortKey="piece"
                      activeSortKey={failureSort?.key ?? null}
                      direction={failureSort?.direction ?? null}
                      onSort={(key) =>
                        setFailureSort((prev) => nextTableSort(prev, key as FailureSortKey))
                      }
                      className="px-3 py-3"
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {failureRows.map((row) => (
                    <tr key={row.id} className="bg-red-50/40 text-slate-800">
                      <td className="px-3 py-3 whitespace-nowrap">
                        {formatClock(row.scanned_at)}
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded-lg bg-red-100 px-2.5 py-1 text-xs font-semibold capitalize text-red-800">
                          {row.scan_kind}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs sm:text-sm">{row.raw_code || "-"}</td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-red-900">{row.reason}</div>
                        <div className="text-xs text-slate-500">{row.reason_code}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div>{row.employee_name || row.arm_employee_name || "-"}</div>
                        <div className="text-slate-500">
                          {row.employee_id_number ||
                            (row.arm_employee_id ? `arm ${row.arm_employee_id}` : "-")}
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div>{row.kiosk_id}</div>
                        {row.workstation_id ? (
                          <div className="text-slate-500">{row.workstation_id}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs sm:text-sm">
                        {row.related_production_code || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}
      </div>
    </StitchScanCaptureProvider>
  );
}
