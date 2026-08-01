import type {
  SewingKioskArm,
  SewingKioskUiPhase,
  SewingSession,
  SewingSessionsFile,
} from "@/lib/types/sewing-sessions";

export const SEWING_ARM_TIMEOUT_MS = 30_000;
export const SEWING_CLOSING_TIMEOUT_MS = 30_000;

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

export function sewingSessionsDashboard(store: SewingSessionsFile, at = Date.now()) {
  const fresh = expireStaleSewingState(store, at);
  const open = fresh.sessions.filter((row) => row.status === "open" || row.status === "closing");
  const startOfDay = new Date(at);
  startOfDay.setHours(0, 0, 0, 0);
  const dayStart = startOfDay.getTime();

  const closedToday = fresh.sessions.filter(
    (row) =>
      row.status === "closed" &&
      row.ended_at &&
      new Date(row.ended_at).getTime() >= dayStart
  );

  const byEmployee = new Map<string, { employee_name: string; count: number; duration_sec: number }>();
  for (const row of closedToday) {
    const cur = byEmployee.get(row.employee_id) ?? {
      employee_name: row.employee_name,
      count: 0,
      duration_sec: 0,
    };
    cur.count += 1;
    cur.duration_sec += row.duration_sec ?? 0;
    byEmployee.set(row.employee_id, cur);
  }

  return {
    open_sessions: open,
    closed_today: closedToday.length,
    completed_by_employee: [...byEmployee.values()].sort((a, b) => b.count - a.count),
    kiosk_arms: fresh.kiosk_arms,
  };
}

export function productionCodesMatch(a: string, b: string): boolean {
  const left = a.trim().toUpperCase();
  const right = b.trim().toUpperCase();
  if (!left || !right) return false;
  if (left === right) return true;
  return left.endsWith(right) || right.endsWith(left);
}
