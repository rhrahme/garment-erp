"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SewingElapsedBreakdownView } from "@/components/production/SewingElapsedBreakdown";
import ScanQrSvg from "@/components/production/ScanQrSvg";
import { garmentTypeColorClasses } from "@/lib/production/garment-type-colors";
import type { SewingFloorAttendance, SewingFloorAttendanceRow } from "@/lib/production/sewing-floor-dashboard";
import { sewingSessionArticleLabel } from "@/lib/production/sewing-session-article-label";
import {
  sewingLiveClockNowMs,
  type SewingDashboardPeriod,
  type SewingEmployeeWorkPeriod,
  type SewingEmployeeWorkSummary,
  type SewingPauseIntervalLike,
} from "@/lib/production/sewing-session-state";
import {
  sewingSessionClientDisplayName,
  sewingSessionScanQrLabel,
} from "@/lib/production/sewing-session-status-label";
import { cn } from "@/lib/utils";

const PERIODS: { id: SewingDashboardPeriod; label: string }[] = [
  { id: "day", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
];

type RosterFilter = "missing" | "scanned" | "live" | "all";

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

function rowMatchesQuery(row: SewingFloorAttendanceRow, needle: string): boolean {
  if (!needle) return true;
  return [row.employee_name, row.employee_id_number, row.employee_id, row.activity, row.workstation_id]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

export function StitchAdminEmployeeWorkPanel({
  pauseIntervals = [],
  kioskPaused = false,
  kioskPausedAt = null,
}: {
  pauseIntervals?: SewingPauseIntervalLike[];
  kioskPaused?: boolean;
  kioskPausedAt?: string | null;
}) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [rosterPeriod, setRosterPeriod] = useState<SewingDashboardPeriod>("day");
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>("missing");
  const [attendance, setAttendance] = useState<SewingFloorAttendance | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [query, setQuery] = useState("");
  const [work, setWork] = useState<SewingEmployeeWorkSummary | null>(null);
  const [detailPeriod, setDetailPeriod] = useState<SewingDashboardPeriod>("day");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const loadAdmin = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const session = res.ok ? await res.json() : null;
      setIsAdmin(Boolean(session?.is_admin));
    } catch {
      setIsAdmin(false);
    }
  }, []);

  const loadWork = useCallback(
    async (nextEmployeeId: string, period: SewingDashboardPeriod) => {
      try {
        const params = new URLSearchParams({ period });
        if (nextEmployeeId) params.set("employee_id", nextEmployeeId);
        const res = await fetch(`/api/production/sewing-session/employee-work?${params}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as {
          attendance?: SewingFloorAttendance;
          work?: SewingEmployeeWorkSummary;
          error?: string;
        };
        if (res.status === 403) {
          setIsAdmin(false);
          return;
        }
        if (!res.ok && res.status !== 404) {
          throw new Error(json.error ?? "Failed to load floor dashboard.");
        }
        setAttendance(json.attendance ?? null);
        setWork(json.work ?? null);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load floor dashboard.");
      }
    },
    []
  );

  useEffect(() => {
    void loadAdmin();
  }, [loadAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadWork(employeeId, rosterPeriod);
    const id = window.setInterval(() => void loadWork(employeeId, rosterPeriod), 12_000);
    return () => window.clearInterval(id);
  }, [isAdmin, employeeId, rosterPeriod, loadWork]);

  const rosterRows = useMemo(() => {
    if (!attendance) return [];
    const all = [...attendance.missing_rows, ...attendance.scanned_rows];
    const needle = query.trim().toLowerCase();
    return all.filter((row) => {
      if (!rowMatchesQuery(row, needle)) return false;
      if (rosterFilter === "missing") return !row.scanned;
      if (rosterFilter === "scanned") return row.scanned;
      if (rosterFilter === "live") return row.live;
      return true;
    });
  }, [attendance, query, rosterFilter]);

  if (!isAdmin) return null;

  const selectedPeriod: SewingEmployeeWorkPeriod | null = work ? work[detailPeriod] : null;
  const liveClockNow = sewingLiveClockNowMs({
    wallNow: now,
    kioskPaused,
    kioskPausedAt,
  });

  function selectEmployee(id: string) {
    setEmployeeId(id);
    setDetailPeriod(rosterPeriod);
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-xl font-semibold text-slate-900">Floor dashboard</h2>
        <p className="mt-1 text-sm text-slate-500">
          Admin only. Who scanned, who is still missing, and one employee&apos;s day / week /
          month. Missing = active Expats badge list with a floor job and no stitch scan yet.
        </p>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((item) => {
            const active = rosterPeriod === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setRosterPeriod(item.id)}
                className={cn(
                  "min-h-[48px] rounded-xl px-4 py-2.5 text-base font-semibold",
                  active
                    ? "bg-slate-900 text-white"
                    : "bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {attendance ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <KpiCard
              label="Expected"
              value={attendance.expected}
              hint="Floor badge roster"
            />
            <KpiCard
              label="Scanned"
              value={attendance.scanned}
              hint={`${attendance.pieces} pcs / ${formatDuration(attendance.duration_sec)}`}
              tone="ok"
            />
            <KpiCard
              label="Didn't scan"
              value={attendance.missing}
              hint="Investigate these"
              tone={attendance.missing > 0 ? "warn" : "ok"}
              active={rosterFilter === "missing"}
              onClick={() => setRosterFilter("missing")}
            />
            <KpiCard
              label="Live now"
              value={attendance.live}
              hint="Open on the floor"
              tone={attendance.live > 0 ? "live" : "plain"}
              active={rosterFilter === "live"}
              onClick={() => setRosterFilter("live")}
            />
            <KpiCard
              label="Pieces"
              value={attendance.pieces}
              hint="Closed, counted hours"
            />
          </div>
        ) : (
          <p className="text-sm text-slate-500">Loading floor roster...</p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">
            Search
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, badge, Cutting, PL-1-2..."
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-900"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["missing", "Didn't scan"],
                ["scanned", "Scanned"],
                ["live", "Live"],
                ["all", "All"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setRosterFilter(id)}
                className={cn(
                  "min-h-[44px] rounded-full px-3.5 py-2 text-sm font-semibold",
                  rosterFilter === id
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                )}
              >
                {label}
                {attendance
                  ? ` ${
                      id === "missing"
                        ? attendance.missing
                        : id === "scanned"
                          ? attendance.scanned
                          : id === "live"
                            ? attendance.live
                            : attendance.expected
                    }`
                  : ""}
              </button>
            ))}
          </div>
        </div>

        {error ? <p className="text-sm text-rose-700">{error}</p> : null}

        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          {rosterRows.length === 0 ? (
            <li className="px-4 py-6 text-sm text-slate-500">
              {rosterFilter === "missing"
                ? "Everyone expected has scanned in this period."
                : "No employees match this filter."}
            </li>
          ) : (
            rosterRows.map((row) => {
              const selected = employeeId === row.employee_id;
              return (
                <li key={row.employee_id}>
                  <div
                    className={cn(
                      "flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3",
                      selected ? "bg-indigo-50" : "bg-white",
                      !row.scanned ? "border-l-4 border-l-amber-400" : "border-l-4 border-l-transparent"
                    )}
                  >
                    <div className="min-w-0 cursor-text select-text">
                      <p className="text-base font-semibold text-slate-900">{row.employee_name}</p>
                      <p className="text-sm text-slate-500">
                        {row.employee_id_number}
                        {row.activity ? ` - ${row.activity}` : ""}
                        {row.workstation_id ? ` - ${row.workstation_id}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="cursor-text select-text text-right">
                        {row.live ? (
                          <p className="text-sm font-semibold text-emerald-700">Live</p>
                        ) : row.scanned ? (
                          <p className="text-sm font-semibold text-slate-800">
                            {row.count} pcs - {formatDuration(row.duration_sec)}
                          </p>
                        ) : (
                          <p className="text-sm font-semibold text-amber-800">No scan yet</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => selectEmployee(row.employee_id)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                      >
                        {selected ? "Selected" : "Open"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })
          )}
        </ul>

        {employeeId && work ? (
          <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
            <div>
              <p className="text-lg font-semibold text-slate-900">{work.employee_name}</p>
              <p className="text-sm text-slate-500">
                {work.employee_id_number} - tap a period for the piece list
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {PERIODS.map((item) => {
                const bucket = work[item.id];
                const active = detailPeriod === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setDetailPeriod(item.id)}
                    className={cn(
                      "rounded-xl border px-4 py-3 text-left",
                      active
                        ? "border-indigo-600 bg-white"
                        : "border-slate-200 bg-white/70 hover:bg-white"
                    )}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {item.label}
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                      {bucket.count}
                      <span className="ml-1 text-sm font-medium text-slate-500">pcs</span>
                    </p>
                    <p className="text-sm font-semibold tabular-nums text-slate-800">
                      {formatDuration(bucket.duration_sec)}
                    </p>
                    {bucket.open_sessions.length > 0 ? (
                      <p className="mt-1 text-xs font-medium text-amber-800">
                        Live now: {bucket.open_sessions.length}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">
                        Avg {formatDuration(bucket.avg_duration_sec)}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
            {selectedPeriod ? (
              <PieceList
                period={selectedPeriod}
                liveClockNow={liveClockNow}
                pauseIntervals={pauseIntervals}
                title={`${PERIODS.find((row) => row.id === detailPeriod)?.label} pieces`}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function KpiCard({
  label,
  value,
  hint,
  tone = "plain",
  active = false,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  tone?: "plain" | "ok" | "warn" | "live";
  active?: boolean;
  onClick?: () => void;
}) {
  const toneClass =
    tone === "warn"
      ? "border-amber-300 bg-amber-50"
      : tone === "ok"
        ? "border-emerald-200 bg-emerald-50"
        : tone === "live"
          ? "border-sky-200 bg-sky-50"
          : "border-slate-200 bg-slate-50";
  const inner = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "rounded-xl border px-4 py-3 text-left",
          toneClass,
          active ? "ring-2 ring-slate-900" : ""
        )}
      >
        {inner}
      </button>
    );
  }
  return <div className={cn("rounded-xl border px-4 py-3", toneClass)}>{inner}</div>;
}

function PieceList({
  period,
  liveClockNow,
  pauseIntervals,
  title,
}: {
  period: SewingEmployeeWorkPeriod;
  liveClockNow: number;
  pauseIntervals: SewingPauseIntervalLike[];
  title: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">
          {title}
          {period.articles.length ? ` - ${period.articles.join(" / ")}` : ""}
        </p>
      </div>
      <ul className="px-4 py-2">
        {period.open_sessions.length === 0 && period.sessions.length === 0 ? (
          <li className="py-3 text-sm text-slate-500">No closed pieces in this period.</li>
        ) : (
          <>
            {period.open_sessions.map((piece) => {
              const article = sewingSessionArticleLabel(piece);
              const articleColor = garmentTypeColorClasses(article || null);
              const scanQr = sewingSessionScanQrLabel(piece);
              return (
                <li
                  key={piece.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-3",
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
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                          Live
                        </span>
                      </p>
                      <p className="font-mono text-sm font-medium text-slate-800">{scanQr}</p>
                      <p className="text-sm text-slate-500">
                        {sewingSessionClientDisplayName(piece)}
                        {piece.so_number ? ` / ${piece.so_number}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="px-1 text-right text-sm">
                    <SewingElapsedBreakdownView
                      startedAt={piece.started_at}
                      endAt={liveClockNow}
                      pauses={pauseIntervals}
                      compact
                      className="items-end text-right"
                    />
                  </div>
                </li>
              );
            })}
            {period.sessions.map((piece) => {
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
                      <p className="font-mono text-sm font-medium text-slate-800">{scanQr}</p>
                      <p className="text-sm text-slate-500">
                        {sewingSessionClientDisplayName(piece)}
                        {piece.so_number ? ` / ${piece.so_number}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="px-1 text-right text-sm">
                    <SewingElapsedBreakdownView
                      startedAt={piece.started_at}
                      endAt={piece.ended_at ? Date.parse(piece.ended_at) : liveClockNow}
                      pauses={pauseIntervals}
                      fallbackSec={piece.duration_sec}
                      compact
                      className="items-end text-right"
                    />
                    <p className="text-slate-500">{formatClock(piece.ended_at)}</p>
                  </div>
                </li>
              );
            })}
          </>
        )}
      </ul>
    </div>
  );
}
