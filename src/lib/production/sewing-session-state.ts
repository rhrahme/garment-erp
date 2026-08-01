import type {
  SewingKioskArm,
  SewingKioskUiPhase,
  SewingSession,
  SewingSessionsFile,
} from "@/lib/types/sewing-sessions";

export const SEWING_ARM_TIMEOUT_MS = 30_000;
export const SEWING_CLOSING_TIMEOUT_MS = 30_000;
export const SEWING_HISTORY_CAP = 500;

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
};

function ageMs(iso: string, at: number): number {
  return at - new Date(iso).getTime();
}

export function sessionPhase(
  session: SewingSession | null,
  arm: SewingKioskArm | null
): SewingKioskUiPhase {
  if (session?.status === "closing") return "piece_closing";
  if (session?.status === "open") return "piece_open";
  if (arm) return "identity_armed";
  return "idle";
}

/** Expire stale arms / closing waits. Pure helper for tests. */
export function expireStaleSewingState(
  store: SewingSessionsFile,
  at = Date.now()
): SewingSessionsFile {
  const arms = store.kiosk_arms.filter(
    (arm) => ageMs(arm.armed_at, at) <= SEWING_ARM_TIMEOUT_MS
  );
  const sessions = store.sessions.map((session) => {
    if (session.status === "closing" && session.closing_armed_at) {
      if (ageMs(session.closing_armed_at, at) > SEWING_CLOSING_TIMEOUT_MS) {
        return { ...session, status: "open" as const, closing_armed_at: null };
      }
    }
    return session;
  });
  return { ...store, kiosk_arms: arms, sessions };
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
  const byEmployee = new Map<string, SewingEmployeeAggregate>();
  for (const row of closed) {
    const cur = byEmployee.get(row.employee_id) ?? {
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      count: 0,
      duration_sec: 0,
      avg_duration_sec: 0,
    };
    cur.count += 1;
    cur.duration_sec += row.duration_sec ?? 0;
    byEmployee.set(row.employee_id, cur);
  }
  return [...byEmployee.values()]
    .map((row) => ({
      ...row,
      avg_duration_sec: row.count > 0 ? Math.round(row.duration_sec / row.count) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.employee_name.localeCompare(b.employee_name));
}

export type SewingSessionsDashboardOptions = {
  period?: SewingDashboardPeriod;
  from?: string | null;
  to?: string | null;
  history_cap?: number;
};

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
    completed_by_employee: aggregateClosedByEmployee(closedInPeriod),
    /** Always today (local day) - for Live "today so far" per stitcher. */
    today_by_employee: aggregateClosedByEmployee(closedToday),
    sessions: historyCandidates.slice(0, historyCap),
    kiosk_arms: fresh.kiosk_arms,
  };
}

/** Elapsed seconds for an open session; null if invalid. */
export function sewingSessionElapsedSec(startedAt: string, at = Date.now()): number {
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((at - start) / 1000));
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
