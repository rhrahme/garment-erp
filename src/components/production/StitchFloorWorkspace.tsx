"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { StitchKioskPanel } from "@/components/production/StitchKioskPanel";
import { StitchOrdersPanel } from "@/components/production/StitchOrdersPanel";
import {
  StitchScanCaptureProvider,
  StitchScannerReadyBadge,
} from "@/components/production/stitch-scan-capture";
import { sewingSessionArticleLabel } from "@/lib/production/sewing-session-article-label";
import {
  SEWING_LIVE_LONG_RUNNING_SEC,
  sewingSessionElapsedSec,
  type SewingDashboardPeriod,
  type SewingEmployeeAggregate,
} from "@/lib/production/sewing-session-state";
import type { SewingScanFailure } from "@/lib/types/sewing-scan-failures";
import type { SewingSession } from "@/lib/types/sewing-sessions";
import { cn } from "@/lib/utils";

type FloorTab = "scan" | "orders" | "live" | "performance" | "history";
type HistoryMode = "sessions" | "failures";

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
    row.employee_name,
    row.employee_id_number,
    row.production_code,
    row.scan_code,
    row.so_number,
    row.client_name,
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

  const historyRows = useMemo(() => {
    const rows = data?.sessions ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => sessionSearchBlob(row).includes(q));
  }, [data?.sessions, search]);

  const failureRows = useMemo(() => {
    const rows = data?.failed_scans ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => failureSearchBlob(row).includes(q));
  }, [data?.failed_scans, search]);

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
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Who is sewing now</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Open sessions across kiosks. Refresh every 12s. Red elapsed = over 45 min.
                </p>
              </div>
              {data && (
                <p className="text-sm font-semibold tabular-nums text-slate-700">
                  {data.open_sessions.filter((s) => s.status === "open").length} sewing
                  {" / "}
                  {data.open_sessions.filter((s) => s.status === "closing").length} closing
                </p>
              )}
            </div>
          </div>
          <div className="p-4 sm:p-5">
            {!data ? (
              <p className="text-base text-slate-500">Loading...</p>
            ) : data.open_sessions.length === 0 ? (
              <p className="text-base text-slate-500">No one sewing right now.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                {[...data.open_sessions]
                  .sort(
                    (a, b) =>
                      sewingSessionElapsedSec(b.started_at, now) -
                      sewingSessionElapsedSec(a.started_at, now)
                  )
                  .map((session) => {
                    const elapsedSec = sewingSessionElapsedSec(session.started_at, now);
                    const longRunning = elapsedSec >= SEWING_LIVE_LONG_RUNNING_SEC;
                    const today =
                      data.today_by_employee?.find((row) => row.employee_id === session.employee_id) ??
                      null;
                    return (
                      <li
                        key={session.id}
                        className={cn(
                          "flex flex-wrap items-start justify-between gap-3 px-4 py-4",
                          longRunning && "bg-red-50/60"
                        )}
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <p className="text-lg font-semibold text-slate-900">
                              {session.employee_name}
                            </p>
                            {session.employee_id_number ? (
                              <p className="font-mono text-sm text-slate-500">
                                ID {session.employee_id_number}
                              </p>
                            ) : null}
                          </div>
                          <p className="text-base font-semibold text-slate-800">
                            {sewingSessionArticleLabel(session) || "-"}
                          </p>
                          <p className="text-sm font-medium text-slate-700">
                            {session.production_code}
                            {session.piece_mark ? ` / ${session.piece_mark}` : ""}
                          </p>
                          <p className="text-sm text-slate-500">
                            {session.client_name || "No client"}
                            {session.so_number ? ` / ${session.so_number}` : ""}
                            {session.fabric_number ? ` / fabric ${session.fabric_number}` : ""}
                          </p>
                          <p className="text-xs text-slate-500">
                            Started {formatClock(session.started_at)}
                            {session.workstation_id
                              ? ` / station ${session.workstation_id}`
                              : ""}
                            {session.kiosk_id ? ` / kiosk ${session.kiosk_id}` : ""}
                          </p>
                          {today && today.count > 0 ? (
                            <p className="text-xs font-medium text-slate-600">
                              Today so far: {today.count} pcs / {formatDuration(today.duration_sec)}
                            </p>
                          ) : (
                            <p className="text-xs text-slate-400">Today so far: first piece</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span
                            className={cn(
                              "text-2xl font-semibold tabular-nums",
                              longRunning ? "text-red-700" : "text-slate-900"
                            )}
                          >
                            {formatElapsed(session.started_at, now)}
                          </span>
                          {longRunning ? (
                            <span className="rounded-lg bg-red-100 px-3 py-1 text-sm font-semibold text-red-800">
                              Long running
                            </span>
                          ) : null}
                          <span
                            className={cn(
                              "rounded-lg px-3 py-1 text-sm font-semibold",
                              session.status === "closing"
                                ? "bg-sky-100 text-sky-800"
                                : "bg-emerald-100 text-emerald-800"
                            )}
                          >
                            {session.status === "closing" ? "Closing" : "Sewing"}
                          </span>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        </section>
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
                            Tap to {expanded ? "hide" : "show"} pieces
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
                            pieces.map((piece) => (
                              <li
                                key={piece.id}
                                className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-3 last:border-b-0"
                              >
                                <div className="min-w-0 space-y-0.5">
                                  <p className="text-base font-semibold text-slate-800">
                                    {sewingSessionArticleLabel(piece) || "-"}
                                  </p>
                                  <p className="text-sm font-medium text-slate-700">
                                    {piece.production_code}
                                    {piece.piece_mark ? ` / ${piece.piece_mark}` : ""}
                                  </p>
                                  <p className="text-sm text-slate-500">
                                    {piece.client_name || "No client"}
                                    {piece.so_number ? ` / ${piece.so_number}` : ""}
                                  </p>
                                </div>
                                <div className="text-right text-sm">
                                  <p className="tabular-nums font-semibold text-slate-800">
                                    {formatDuration(piece.duration_sec)}
                                  </p>
                                  <p className="text-slate-500">{formatClock(piece.ended_at)}</p>
                                </div>
                              </li>
                            ))
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
                    ? "Closed in period plus open sessions. Search employee, article, piece, SO, or client."
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
              placeholder={
                historyMode === "sessions"
                  ? "Search employee, article, piece, SO, client..."
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
                      <th className="px-3 py-3">Employee</th>
                      <th className="px-3 py-3">Article</th>
                      <th className="px-3 py-3">Piece</th>
                      <th className="px-3 py-3">SO / Client</th>
                      <th className="px-3 py-3">Start</th>
                      <th className="px-3 py-3">End</th>
                      <th className="px-3 py-3">Duration</th>
                      <th className="px-3 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyRows.map((row) => (
                      <tr key={row.id} className="text-slate-800">
                        <td className="px-3 py-3 font-medium">{row.employee_name}</td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-slate-900">
                            {sewingSessionArticleLabel(row) || "-"}
                          </div>
                          {row.piece_mark ? (
                            <div className="text-xs text-slate-500">{row.piece_mark}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs sm:text-sm">
                          {row.production_code}
                        </td>
                        <td className="px-3 py-3">
                          <div>{row.so_number || "-"}</div>
                          <div className="text-slate-500">{row.client_name || "-"}</div>
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
                              "rounded-lg px-2.5 py-1 text-xs font-semibold capitalize",
                              row.status === "closed"
                                ? "bg-slate-100 text-slate-700"
                                : row.status === "closing"
                                  ? "bg-sky-100 text-sky-800"
                                  : "bg-emerald-100 text-emerald-800"
                            )}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : failureRows.length === 0 ? (
              <p className="px-3 py-4 text-base text-slate-500">No failed scans in this period.</p>
            ) : (
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3">When</th>
                    <th className="px-3 py-3">Kind</th>
                    <th className="px-3 py-3">Code</th>
                    <th className="px-3 py-3">Reason</th>
                    <th className="px-3 py-3">Employee / Arm</th>
                    <th className="px-3 py-3">Kiosk</th>
                    <th className="px-3 py-3">Related piece</th>
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
