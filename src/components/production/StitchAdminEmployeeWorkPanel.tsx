"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SewingElapsedBreakdownView } from "@/components/production/SewingElapsedBreakdown";
import ScanQrSvg from "@/components/production/ScanQrSvg";
import { garmentTypeColorClasses } from "@/lib/production/garment-type-colors";
import type { SewingFloorAttendance, SewingFloorAttendanceRow } from "@/lib/production/sewing-floor-dashboard";
import { sewingSessionArticleLabel } from "@/lib/production/sewing-session-article-label";
import {
  isStitchLiveClockFrozen,
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
import {
  formatMorningEntryLabel,
  formatMorningLeaveLabel,
} from "@/lib/production/stitch-attendance";
import { cn } from "@/lib/utils";

const PERIODS: { id: SewingDashboardPeriod; label: string }[] = [
  { id: "day", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
];

type RosterFilter = "entered" | "left" | "missing" | "live" | "all";

function attendanceRows(attendance: SewingFloorAttendance): SewingFloorAttendanceRow[] {
  return [...attendance.missing_rows, ...attendance.scanned_rows];
}

function hasMorningEntry(row: SewingFloorAttendanceRow): boolean {
  return Boolean(row.checked_in_at);
}

function hasLeft(row: SewingFloorAttendanceRow): boolean {
  return Boolean(row.checked_out_at);
}

function compareMorningEntry(a: SewingFloorAttendanceRow, b: SewingFloorAttendanceRow): number {
  if (a.checked_in_at && b.checked_in_at) {
    return Date.parse(a.checked_in_at) - Date.parse(b.checked_in_at);
  }
  if (a.checked_in_at) return -1;
  if (b.checked_in_at) return 1;
  return a.employee_name.localeCompare(b.employee_name);
}

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
  kioskLunchActive = false,
}: {
  pauseIntervals?: SewingPauseIntervalLike[];
  kioskPaused?: boolean;
  kioskPausedAt?: string | null;
  kioskLunchActive?: boolean;
}) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [rosterPeriod, setRosterPeriod] = useState<SewingDashboardPeriod>("day");
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>("entered");
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
    async (nextEmployeeId: string, period: SewingDashboardPeriod, asAdmin: boolean) => {
      try {
        const params = new URLSearchParams({ period });
        if (asAdmin && nextEmployeeId) params.set("employee_id", nextEmployeeId);
        const res = await fetch(`/api/production/sewing-session/employee-work?${params}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as {
          attendance?: SewingFloorAttendance;
          work?: SewingEmployeeWorkSummary;
          error?: string;
        };
        if (res.status === 403) {
          throw new Error(json.error ?? "Forbidden.");
        }
        if (!res.ok && res.status !== 404) {
          throw new Error(json.error ?? "Failed to load floor dashboard.");
        }
        setAttendance(json.attendance ?? null);
        setWork(asAdmin ? json.work ?? null : null);
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
    void loadWork(employeeId, rosterPeriod, isAdmin);
    const id = window.setInterval(() => void loadWork(employeeId, rosterPeriod, isAdmin), 12_000);
    return () => window.clearInterval(id);
  }, [employeeId, rosterPeriod, isAdmin, loadWork]);

  useEffect(() => {
    if (!isAdmin && rosterFilter === "live") setRosterFilter("entered");
  }, [isAdmin, rosterFilter]);

  const rosterRows = useMemo(() => {
    if (!attendance) return [];
    const all = attendanceRows(attendance);
    const needle = query.trim().toLowerCase();
    return all
      .filter((row) => {
        if (!rowMatchesQuery(row, needle)) return false;
        if (rosterFilter === "entered") return hasMorningEntry(row);
        if (rosterFilter === "left") return hasLeft(row);
        if (rosterFilter === "missing") return !hasMorningEntry(row);
        if (rosterFilter === "live") return row.live;
        return true;
      })
      .sort(compareMorningEntry);
  }, [attendance, query, rosterFilter]);

  const selectedRow = (attendance ? attendanceRows(attendance) : []).find(
    (row) => row.employee_id === employeeId
  );
  const includeDate = rosterPeriod !== "day";
  const selectedCheckIn = formatMorningEntryLabel(selectedRow?.checked_in_at, { includeDate });
  const selectedCheckOut = formatMorningLeaveLabel(selectedRow?.checked_out_at, { includeDate });
  const noMorningEntry = attendance
    ? attendanceRows(attendance).filter((row) => !hasMorningEntry(row)).length
    : 0;
  const selectedPeriod: SewingEmployeeWorkPeriod | null = work ? work[detailPeriod] : null;
  const liveClockNow = sewingLiveClockNowMs({
    wallNow: now,
    kioskPaused,
    kioskPausedAt,
  });
  const liveClockFrozen = isStitchLiveClockFrozen({
    wallNow: now,
    kioskPaused,
    kioskLunchActive,
  });
  const liveClockFrozenLabel = kioskLunchActive ? "Frozen for lunch" : "Frozen";

  function selectEmployee(id: string) {
    setEmployeeId(id);
    setDetailPeriod(rosterPeriod);
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-xl font-semibold text-slate-900">Attendance</h2>
        <p className="mt-1 text-sm text-slate-500">
          View only. Attendance is the factory door: badge + wall QR (either
          order, from 8 Sep). Morning signs in. Same poster at the end of the
          day signs out. That is not the garment A4. Times are Riyadh.
          Door times cannot be edited here.
        </p>
        {isAdmin ? (
          <a
            href="/stitch/attendance/print?copies=6"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Print attendance QR
          </a>
        ) : null}
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
          <div
            className={cn(
              "grid grid-cols-2 gap-3",
              isAdmin ? "lg:grid-cols-6" : "lg:grid-cols-4"
            )}
          >
            <KpiCard
              label="Expected"
              value={attendance.expected}
              hint="Floor badge roster"
            />
            <KpiCard
              label="Entered"
              value={attendance.entered}
              hint="Morning wall QR time"
              tone={attendance.entered > 0 ? "ok" : "plain"}
              active={rosterFilter === "entered"}
              onClick={() => setRosterFilter("entered")}
            />
            <KpiCard
              label="Left"
              value={attendance.left}
              hint="End-of-day wall QR"
              tone={attendance.left > 0 ? "ok" : "plain"}
              active={rosterFilter === "left"}
              onClick={() => setRosterFilter("left")}
            />
            <KpiCard
              label="No entry"
              value={noMorningEntry}
              hint="No door scan yet"
              tone={noMorningEntry > 0 ? "warn" : "ok"}
              active={rosterFilter === "missing"}
              onClick={() => setRosterFilter("missing")}
            />
            {isAdmin ? (
              <>
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
              </>
            ) : null}
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
              (isAdmin
                ? ([
                    ["entered", "Entered"],
                    ["left", "Left"],
                    ["missing", "No entry"],
                    ["live", "Live"],
                    ["all", "All"],
                  ] as const)
                : ([
                    ["entered", "Entered"],
                    ["left", "Left"],
                    ["missing", "No entry"],
                    ["all", "All"],
                  ] as const))
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
                      id === "entered"
                        ? attendance.entered
                        : id === "left"
                          ? attendance.left
                          : id === "missing"
                            ? noMorningEntry
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
              {rosterFilter === "entered"
                ? "Nobody has scanned the wall QR this period."
                : rosterFilter === "left"
                  ? "Nobody has signed out on the wall QR this period."
                  : rosterFilter === "missing"
                    ? "Everyone on this list has a morning door scan."
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
                      !hasMorningEntry(row)
                        ? "border-l-4 border-l-amber-400"
                        : "border-l-4 border-l-transparent"
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
                        {hasMorningEntry(row) ? (
                          <p className="text-sm font-semibold tabular-nums text-slate-900">
                            {formatMorningEntryLabel(row.checked_in_at, {
                              includeDate: rosterPeriod !== "day",
                            })}
                          </p>
                        ) : (
                          <p className="text-sm font-semibold text-amber-800">No morning entry</p>
                        )}
                        {hasLeft(row) ? (
                          <p className="text-sm font-semibold tabular-nums text-slate-900">
                            {formatMorningLeaveLabel(row.checked_out_at, {
                              includeDate: rosterPeriod !== "day",
                            })}
                          </p>
                        ) : hasMorningEntry(row) ? (
                          <p className="text-xs text-slate-500">Still in</p>
                        ) : null}
                        {isAdmin && row.live ? (
                          <p className="text-xs font-semibold text-emerald-700">Live on a piece</p>
                        ) : isAdmin && row.count > 0 ? (
                          <p className="text-xs text-slate-500">
                            {row.count} pcs - {formatDuration(row.duration_sec)}
                          </p>
                        ) : null}
                      </div>
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => selectEmployee(row.employee_id)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                        >
                          {selected ? "Selected" : "Open"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })
          )}
        </ul>

        {isAdmin && employeeId && work ? (
          <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
            <div>
              <p className="text-lg font-semibold text-slate-900">{work.employee_name}</p>
              <p className="text-sm text-slate-500">
                {work.employee_id_number} - tap a period for the piece list
              </p>
              {selectedCheckIn ? (
                <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                  {selectedCheckIn} Riyadh
                </p>
              ) : attendance ? (
                <p className="mt-1 text-sm text-amber-800">No morning wall QR yet</p>
              ) : null}
              {selectedCheckOut ? (
                <p className="text-sm font-semibold tabular-nums text-slate-900">
                  {selectedCheckOut} Riyadh
                </p>
              ) : selectedCheckIn ? (
                <p className="text-sm text-slate-500">No end-of-day wall QR yet</p>
              ) : null}
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
                      frozen={liveClockFrozen}
                      frozenLabel={liveClockFrozenLabel}
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
