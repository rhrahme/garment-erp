import { sewingSessionArticleLabel } from "@/lib/production/sewing-session-article-label";
import {
  capSessionCloseAtWorkdayEnd,
  sessionWorkdayEndMs,
  shouldAutoCloseForgottenSession,
} from "@/lib/production/stitch-kiosk-lunch";
import type { SewingScanFailure } from "@/lib/types/sewing-scan-failures";
import type {
  SewingKioskArm,
  SewingKioskPieceArm,
  SewingKioskUiPhase,
  SewingSession,
  SewingSessionsFile,
} from "@/lib/types/sewing-sessions";

export const SEWING_ARM_TIMEOUT_MS = 30_000;
export const SEWING_CLOSING_TIMEOUT_MS = 30_000;
export const SEWING_HISTORY_CAP = 500;
export const SEWING_FAILED_SCAN_HISTORY_CAP = 200;

export type SewingDashboardPeriod = "day" | "week" | "month";

export type SewingPeriodWindow = {
  period: SewingDashboardPeriod;
  from_ms: number;
  to_ms: number;
  /** Inclusive local calendar start (00:00). */
  from_iso: string;
  to_iso: string;
};

export type SewingEmployeeAggregate = {
  employee_id: string;
  employee_name: string;
  count: number;
  duration_sec: number;
  avg_duration_sec: number;
  /** Distinct floor article labels for closed pieces (Overshirt, Trouser, ...). */
  articles: string[];
};

export type SewingKioskEmployeeOption = {
  employee_id: string;
  employee_name: string;
  employee_id_number: string;
};

export type SewingEmployeeWorkPeriod = {
  period: SewingDashboardPeriod;
  from_iso: string;
  to_iso: string;
  count: number;
  duration_sec: number;
  avg_duration_sec: number;
  articles: string[];
  sessions: SewingSession[];
  open_sessions: SewingSession[];
};

export type SewingEmployeeWorkSummary = {
  employee_id: string;
  employee_name: string;
  employee_id_number: string;
  day: SewingEmployeeWorkPeriod;
  week: SewingEmployeeWorkPeriod;
  month: SewingEmployeeWorkPeriod;
};

function ageMs(iso: string, at: number): number {
  return at - new Date(iso).getTime();
}

/** Normalize older documents that predate kiosk_piece_arms. */
export function normalizeSewingSessionsFile(store: SewingSessionsFile): SewingSessionsFile {
  return {
    ...store,
    kiosk_arms: store.kiosk_arms ?? [],
    kiosk_piece_arms: store.kiosk_piece_arms ?? [],
    sessions: store.sessions ?? [],
  };
}

export function employeeArmsOnKiosk(
  store: SewingSessionsFile,
  kioskId: string
): SewingKioskArm[] {
  return (store.kiosk_arms ?? []).filter((row) => row.kiosk_id === kioskId);
}

export function pieceArmsOnKiosk(
  store: SewingSessionsFile,
  kioskId: string
): SewingKioskPieceArm[] {
  return (store.kiosk_piece_arms ?? []).filter((row) => row.kiosk_id === kioskId);
}

/**
 * Diagnostic helper: exactly one employee arm, or none / many.
 * Piece starts use {@link mostRecentArm} (original shared-kiosk queue), not this.
 */
export function resolveUniqueEmployeeArm(
  store: SewingSessionsFile,
  kioskId: string
):
  | { status: "one"; arm: SewingKioskArm }
  | { status: "none" }
  | { status: "many"; arms: SewingKioskArm[] } {
  const arms = employeeArmsOnKiosk(store, kioskId);
  if (arms.length === 0) return { status: "none" };
  if (arms.length === 1) return { status: "one", arm: arms[0]! };
  return { status: "many", arms };
}

/**
 * Original shared-kiosk arm pick (restored): newest badge-ready employee wins.
 * Other ready employees stay armed until their A4 is scanned.
 * Matches pre-09033b3 mostRecentArm behavior from 2ac1d24.
 */
export function mostRecentArm(
  store: SewingSessionsFile,
  kioskId: string
): SewingKioskArm | null {
  return (
    employeeArmsOnKiosk(store, kioskId)
      .slice()
      .sort(
        (a, b) =>
          b.armed_at.localeCompare(a.armed_at) || a.employee_id.localeCompare(b.employee_id)
      )[0] ?? null
  );
}

export function resolveUniquePieceArm(
  store: SewingSessionsFile,
  kioskId: string
):
  | { status: "one"; arm: SewingKioskPieceArm }
  | { status: "none" }
  | { status: "many"; arms: SewingKioskPieceArm[] } {
  const arms = pieceArmsOnKiosk(store, kioskId);
  if (arms.length === 0) return { status: "none" };
  if (arms.length === 1) return { status: "one", arm: arms[0]! };
  return { status: "many", arms };
}

export function sessionPhase(
  session: SewingSession | null,
  arm: SewingKioskArm | null,
  pieceArm: SewingKioskPieceArm | null = null
): SewingKioskUiPhase {
  if (session?.status === "closing") return "piece_closing";
  if (session?.status === "open") return "piece_open";
  if (arm) return "identity_armed";
  if (pieceArm) return "piece_armed";
  return "idle";
}

/** Expire stale arms / closing waits. Pure helper for tests. */
export function expireStaleSewingState(
  store: SewingSessionsFile,
  at = Date.now()
): SewingSessionsFile {
  const base = normalizeSewingSessionsFile(store);
  const arms = base.kiosk_arms.filter(
    (arm) => ageMs(arm.armed_at, at) <= SEWING_ARM_TIMEOUT_MS
  );
  const pieceArms = (base.kiosk_piece_arms ?? []).filter(
    (arm) => ageMs(arm.armed_at, at) <= SEWING_ARM_TIMEOUT_MS
  );
  const sessions = base.sessions.map((session) => {
    if (session.status === "closing" && session.closing_armed_at) {
      if (ageMs(session.closing_armed_at, at) > SEWING_CLOSING_TIMEOUT_MS) {
        return {
          ...session,
          status: "open" as const,
          closing_armed_at: null,
          closing_confirm: null,
        };
      }
    }
    return session;
  });
  return { ...base, kiosk_arms: arms, kiosk_piece_arms: pieceArms, sessions };
}

/**
 * Floor finishes at 22:00 Riyadh: leftover open/closing sessions become
 * History at that instant. Pure helper — persist via ensureForgottenSessionsClosedAtWorkdayEnd.
 */
export function applyWorkdayEndCloses(
  store: SewingSessionsFile,
  nowMs: number = Date.now(),
  pauses: SewingPauseIntervalLike[] = []
): { store: SewingSessionsFile; closed: SewingSession[] } {
  const base = normalizeSewingSessionsFile(store);
  const closed: SewingSession[] = [];
  const closedEmployeeIds = new Set<string>();
  const closedCodes = new Set<string>();
  const sessions = base.sessions.map((session) => {
    if (session.status !== "open" && session.status !== "closing") return session;
    if (session.overtime_status === "pending" || session.overtime_status === "confirmed") {
      return session;
    }
    if (!shouldAutoCloseForgottenSession(session.started_at, nowMs)) return session;
    const startedMs = Date.parse(session.started_at);
    const endedMs = sessionWorkdayEndMs(startedMs);
    const next: SewingSession = {
      ...session,
      status: "closed",
      ended_at: new Date(endedMs).toISOString(),
      duration_sec: sewingSessionElapsedSecExcludingPauses(
        session.started_at,
        endedMs,
        pauses
      ),
      closing_armed_at: null,
      closing_confirm: null,
    };
    closed.push(next);
    if (session.employee_id) closedEmployeeIds.add(session.employee_id);
    if (session.production_code) closedCodes.add(session.production_code);
    return next;
  });
  if (closed.length === 0) return { store: base, closed };
  return {
    store: {
      ...base,
      sessions,
      kiosk_arms: base.kiosk_arms.filter((arm) => !closedEmployeeIds.has(arm.employee_id)),
      kiosk_piece_arms: (base.kiosk_piece_arms ?? []).filter(
        (arm) => !closedCodes.has(arm.production_code)
      ),
    },
    closed,
  };
}

/**
 * Factory-local period windows (JS Date local TZ).
 * - day: today 00:00 through `at`
 * - week: calendar week Mon-Sun containing `at` (from Monday 00:00)
 * - month: current calendar month from the 1st 00:00
 */
export function sewingPeriodWindow(
  period: SewingDashboardPeriod,
  at = Date.now(),
  opts?: { from?: string | null; to?: string | null }
): SewingPeriodWindow {
  const customFrom = opts?.from ? Date.parse(opts.from) : NaN;
  const customTo = opts?.to ? Date.parse(opts.to) : NaN;
  if (Number.isFinite(customFrom) && Number.isFinite(customTo) && customTo >= customFrom) {
    return {
      period,
      from_ms: customFrom,
      to_ms: customTo,
      from_iso: new Date(customFrom).toISOString(),
      to_iso: new Date(customTo).toISOString(),
    };
  }

  const start = new Date(at);
  start.setHours(0, 0, 0, 0);

  if (period === "week") {
    const day = start.getDay(); // 0=Sun .. 6=Sat
    const daysFromMonday = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - daysFromMonday);
  } else if (period === "month") {
    start.setDate(1);
  }

  const from_ms = start.getTime();
  const to_ms = at;
  return {
    period,
    from_ms,
    to_ms,
    from_iso: new Date(from_ms).toISOString(),
    to_iso: new Date(to_ms).toISOString(),
  };
}

export function parseSewingDashboardPeriod(value: string | null | undefined): SewingDashboardPeriod {
  if (value === "week" || value === "month") return value;
  return "day";
}

function inPeriod(iso: string | null | undefined, window: SewingPeriodWindow): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= window.from_ms && t <= window.to_ms;
}

function aggregateClosedByEmployee(closed: SewingSession[]): SewingEmployeeAggregate[] {
  const byEmployee = new Map<
    string,
    Omit<SewingEmployeeAggregate, "articles" | "avg_duration_sec"> & {
      avg_duration_sec: number;
      articleSet: Set<string>;
    }
  >();
  for (const row of closed) {
    const cur = byEmployee.get(row.employee_id) ?? {
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      count: 0,
      duration_sec: 0,
      avg_duration_sec: 0,
      articleSet: new Set<string>(),
    };
    cur.count += 1;
    cur.duration_sec += row.duration_sec ?? 0;
    const label = sewingSessionArticleLabel(row);
    if (label) cur.articleSet.add(label);
    byEmployee.set(row.employee_id, cur);
  }
  return [...byEmployee.values()]
    .map(({ articleSet, ...row }) => ({
      ...row,
      avg_duration_sec: row.count > 0 ? Math.round(row.duration_sec / row.count) : 0,
      articles: [...articleSet].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => b.count - a.count || a.employee_name.localeCompare(b.employee_name));
}

export type SewingSessionsDashboardOptions = {
  period?: SewingDashboardPeriod;
  from?: string | null;
  to?: string | null;
  history_cap?: number;
  failed_scan_cap?: number;
  failed_scans?: SewingScanFailure[];
};

/** Failed kiosk scans in the period window, newest first (optionally capped). */
export function sewingFailedScansForPeriod(
  failures: SewingScanFailure[],
  at = Date.now(),
  options: SewingSessionsDashboardOptions = {}
): SewingScanFailure[] {
  const period = options.period ?? "day";
  const cap = options.failed_scan_cap ?? SEWING_FAILED_SCAN_HISTORY_CAP;
  const window = sewingPeriodWindow(period, at, { from: options.from, to: options.to });
  const inWindow = failures
    .filter((row) => inPeriod(row.scanned_at, window))
    .sort((a, b) => new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime());
  return inWindow.slice(0, cap);
}

export function sewingSessionsDashboard(
  store: SewingSessionsFile,
  at = Date.now(),
  options: SewingSessionsDashboardOptions = {}
) {
  const period = options.period ?? "day";
  const historyCap = options.history_cap ?? SEWING_HISTORY_CAP;
  const window = sewingPeriodWindow(period, at, { from: options.from, to: options.to });
  const fresh = expireStaleSewingState(store, at);
  const open = fresh.sessions.filter((row) => row.status === "open" || row.status === "closing");

  const dayWindow = sewingPeriodWindow("day", at);
  const closedToday = fresh.sessions.filter(
    (row) => row.status === "closed" && inPeriod(row.ended_at, dayWindow)
  );
  const closedInPeriod = fresh.sessions.filter(
    (row) => row.status === "closed" && inPeriod(row.ended_at, window)
  );
  const failedInPeriod = (options.failed_scans ?? []).filter((row) =>
    inPeriod(row.scanned_at, window)
  );
  const failedScans = sewingFailedScansForPeriod(options.failed_scans ?? [], at, options);

  // History: closed in period + currently open/closing (for floor lookup). Cap newest-first.
  const historyCandidates = [
    ...closedInPeriod,
    ...open.filter((row) => !closedInPeriod.some((c) => c.id === row.id)),
  ].sort((a, b) => {
    const aKey = a.ended_at ?? a.started_at;
    const bKey = b.ended_at ?? b.started_at;
    return new Date(bKey).getTime() - new Date(aKey).getTime();
  });

  return {
    period: window.period,
    period_from: window.from_iso,
    period_to: window.to_iso,
    open_sessions: open,
    /** Backward-compatible: always today's closed count (local day). */
    closed_today: closedToday.length,
    closed_in_period: closedInPeriod.length,
    completed_by_employee: aggregateClosedByEmployee(
      closedInPeriod.filter((row) => row.overtime_status !== "rejected")
    ),
    /** Always today (local day) - for Live "today so far" per stitcher. */
    today_by_employee: aggregateClosedByEmployee(
      closedToday.filter((row) => row.overtime_status !== "rejected")
    ),
    sessions: historyCandidates.slice(0, historyCap),
    kiosk_arms: fresh.kiosk_arms,
    kiosk_piece_arms: fresh.kiosk_piece_arms ?? [],
    failed_scans: failedScans,
    failed_scans_in_period: failedInPeriod.length,
  };
}

function sessionMatchesEmployee(row: SewingSession, employeeKey: string): boolean {
  const key = employeeKey.trim();
  if (!key) return false;
  return row.employee_id === key || row.employee_id_number === key;
}

function countsTowardPerformance(row: SewingSession): boolean {
  return row.status === "closed" && row.overtime_status !== "rejected";
}

function sortSessionsNewestFirst(rows: SewingSession[]): SewingSession[] {
  return [...rows].sort((a, b) => {
    const aKey = a.ended_at ?? a.started_at;
    const bKey = b.ended_at ?? b.started_at;
    return new Date(bKey).getTime() - new Date(aKey).getTime();
  });
}

function employeeWorkPeriod(
  rows: SewingSession[],
  period: SewingDashboardPeriod,
  window: SewingPeriodWindow
): SewingEmployeeWorkPeriod {
  const closed = sortSessionsNewestFirst(
    rows.filter((row) => countsTowardPerformance(row) && inPeriod(row.ended_at, window))
  );
  const open = sortSessionsNewestFirst(
    rows.filter(
      (row) =>
        (row.status === "open" || row.status === "closing") && inPeriod(row.started_at, window)
    )
  );
  const duration_sec = closed.reduce((sum, row) => sum + (row.duration_sec ?? 0), 0);
  const articles = [
    ...new Set(
      closed
        .map((row) => sewingSessionArticleLabel(row))
        .filter((label): label is string => Boolean(label))
    ),
  ].sort((a, b) => a.localeCompare(b));
  return {
    period,
    from_iso: window.from_iso,
    to_iso: window.to_iso,
    count: closed.length,
    duration_sec,
    avg_duration_sec: closed.length ? Math.round(duration_sec / closed.length) : 0,
    articles,
    sessions: closed,
    open_sessions: open,
  };
}

/** Employees who have ever scanned on the stitch kiosk, newest activity first. */
export function listSewingKioskEmployees(store: SewingSessionsFile): SewingKioskEmployeeOption[] {
  const fresh = expireStaleSewingState(normalizeSewingSessionsFile(store), Date.now());
  const byId = new Map<string, SewingKioskEmployeeOption & { last_ms: number }>();
  for (const row of fresh.sessions) {
    if (!row.employee_id) continue;
    const last = Date.parse(row.ended_at ?? row.started_at);
    const last_ms = Number.isFinite(last) ? last : 0;
    const existing = byId.get(row.employee_id);
    if (!existing) {
      byId.set(row.employee_id, {
        employee_id: row.employee_id,
        employee_name: row.employee_name,
        employee_id_number: row.employee_id_number,
        last_ms,
      });
      continue;
    }
    if (last_ms > existing.last_ms) {
      existing.last_ms = last_ms;
      existing.employee_name = row.employee_name;
      existing.employee_id_number = row.employee_id_number;
    }
  }
  return [...byId.values()]
    .sort(
      (a, b) =>
        b.last_ms - a.last_ms || a.employee_name.localeCompare(b.employee_name)
    )
    .map(({ last_ms: _last, ...row }) => row);
}

/** One employee's closed work for today / this week / this month (factory-local windows). */
export function sewingEmployeeWorkLookup(
  store: SewingSessionsFile,
  employeeKey: string,
  at = Date.now()
): SewingEmployeeWorkSummary | null {
  const key = employeeKey.trim();
  if (!key) return null;
  const fresh = expireStaleSewingState(normalizeSewingSessionsFile(store), at);
  const rows = fresh.sessions.filter((row) => sessionMatchesEmployee(row, key));
  if (rows.length === 0) return null;
  const newest = sortSessionsNewestFirst(rows)[0]!;
  return {
    employee_id: newest.employee_id,
    employee_name: newest.employee_name,
    employee_id_number: newest.employee_id_number,
    day: employeeWorkPeriod(rows, "day", sewingPeriodWindow("day", at)),
    week: employeeWorkPeriod(rows, "week", sewingPeriodWindow("week", at)),
    month: employeeWorkPeriod(rows, "month", sewingPeriodWindow("month", at)),
  };
}

/** Elapsed seconds for an open session; null if invalid. */
export function sewingSessionElapsedSec(startedAt: string, at = Date.now()): number {
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((at - start) / 1000));
}

export type SewingPauseIntervalLike = {
  started_at: string;
  ended_at?: string | null;
};

/**
 * Elapsed open time excluding stitch-kiosk pause windows (lunch / admin pause).
 * While currently paused, wall clock stops at the open pause start.
 */
export function sewingSessionElapsedSecExcludingPauses(
  startedAt: string,
  at = Date.now(),
  pauses: SewingPauseIntervalLike[] = [],
  options: { ignoreWorkdayCap?: boolean } = {}
): number {
  return sewingSessionElapsedBreakdown(startedAt, at, pauses, options).work_sec;
}

export type SewingElapsedSegmentKind = "work" | "pause";

export type SewingElapsedSegment = {
  kind: SewingElapsedSegmentKind;
  /** Short UI label, e.g. Before lunch / Lunch / After lunch. */
  label: string;
  started_at: string;
  ended_at: string | null;
  sec: number;
};

export type SewingElapsedBreakdown = {
  work_sec: number;
  pause_sec: number;
  wall_sec: number;
  segments: SewingElapsedSegment[];
};

function isLunchishPause(startedAtMs: number, endedAtMs: number): boolean {
  // Asia/Riyadh lunch window roughly 14:00-16:00.
  const mid = startedAtMs + Math.max(0, endedAtMs - startedAtMs) / 2;
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Riyadh",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(mid)).find((p) => p.type === "hour")?.value ?? "NaN"
  );
  return Number.isFinite(hour) && hour >= 13 && hour < 17;
}

/**
 * Work vs pause segments for a session timeline (for Live/History visibility).
 * Pauses that do not overlap the session are ignored.
 */
export function sewingSessionElapsedBreakdown(
  startedAt: string,
  at = Date.now(),
  pauses: SewingPauseIntervalLike[] = [],
  options: { ignoreWorkdayCap?: boolean } = {}
): SewingElapsedBreakdown {
  const start = new Date(startedAt).getTime();
  const empty: SewingElapsedBreakdown = {
    work_sec: 0,
    pause_sec: 0,
    wall_sec: 0,
    segments: [],
  };
  if (!Number.isFinite(start)) return empty;
  const endRaw = Number.isFinite(at) ? at : Date.now();
  const end = options.ignoreWorkdayCap ? endRaw : capSessionCloseAtWorkdayEnd(start, endRaw);
  if (end <= start) return empty;

  const overlaps = pauses
    .map((pause) => {
      const pStart = new Date(pause.started_at).getTime();
      if (!Number.isFinite(pStart)) return null;
      const pEndRaw = pause.ended_at ? new Date(pause.ended_at).getTime() : end;
      const pEnd = Number.isFinite(pEndRaw) ? pEndRaw : end;
      const overlapStart = Math.max(start, pStart);
      const overlapEnd = Math.min(end, pEnd);
      if (overlapEnd <= overlapStart) return null;
      return { start: overlapStart, end: overlapEnd, open: !pause.ended_at };
    })
    .filter((row): row is { start: number; end: number; open: boolean } => Boolean(row))
    .sort((a, b) => a.start - b.start);

  // Merge overlapping pause windows.
  const merged: { start: number; end: number; open: boolean }[] = [];
  for (const row of overlaps) {
    const last = merged[merged.length - 1];
    if (!last || row.start > last.end) {
      merged.push({ ...row });
      continue;
    }
    last.end = Math.max(last.end, row.end);
    last.open = last.open || row.open;
  }

  const segments: SewingElapsedSegment[] = [];
  let cursor = start;
  let workIndex = 0;
  const workCount = merged.length + 1;

  const pushWork = (from: number, to: number, openEnded: boolean) => {
    if (to <= from) return;
    workIndex += 1;
    let label = "Work";
    if (merged.length > 0) {
      if (workIndex === 1) {
        label = isLunchishPause(merged[0]!.start, merged[0]!.end)
          ? "Before lunch"
          : "Before pause";
      } else if (workIndex >= workCount) {
        label = isLunchishPause(merged[merged.length - 1]!.start, merged[merged.length - 1]!.end)
          ? "After lunch"
          : "After pause";
      } else {
        label = `Work ${workIndex}`;
      }
    }
    segments.push({
      kind: "work",
      label,
      started_at: new Date(from).toISOString(),
      ended_at: openEnded ? null : new Date(to).toISOString(),
      sec: Math.floor((to - from) / 1000),
    });
  };

  for (const pause of merged) {
    pushWork(cursor, pause.start, false);
    const lunch = isLunchishPause(pause.start, pause.end);
    segments.push({
      kind: "pause",
      label: lunch ? "Lunch" : "Paused",
      started_at: new Date(pause.start).toISOString(),
      ended_at: pause.open ? null : new Date(pause.end).toISOString(),
      sec: Math.floor((pause.end - pause.start) / 1000),
    });
    cursor = pause.end;
  }
  pushWork(cursor, end, true);

  const work_sec = segments
    .filter((s) => s.kind === "work")
    .reduce((sum, s) => sum + s.sec, 0);
  const pause_sec = segments
    .filter((s) => s.kind === "pause")
    .reduce((sum, s) => sum + s.sec, 0);

  return {
    work_sec,
    pause_sec,
    wall_sec: Math.floor((end - start) / 1000),
    segments,
  };
}

/** Effective "now" for Live clocks: freeze at current pause start when kiosk is paused. */
export function sewingLiveClockNowMs(input: {
  wallNow?: number;
  kioskPaused?: boolean;
  kioskPausedAt?: string | null;
}): number {
  const wall = input.wallNow ?? Date.now();
  if (!input.kioskPaused || !input.kioskPausedAt) return wall;
  const pausedAt = new Date(input.kioskPausedAt).getTime();
  if (!Number.isFinite(pausedAt)) return wall;
  return Math.min(wall, pausedAt);
}

/** Warn when a piece has been open longer than this (45 minutes). */
export const SEWING_LIVE_LONG_RUNNING_SEC = 45 * 60;

export function productionCodesMatch(a: string, b: string): boolean {
  const left = a.trim().toUpperCase();
  const right = b.trim().toUpperCase();
  if (!left || !right) return false;
  if (left === right) return true;
  return left.endsWith(right) || right.endsWith(left);
}
