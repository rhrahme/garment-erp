import { readSewingSessionsFresh, writeSewingSessions } from "@/lib/data/sewing-sessions";
import { readStitchKioskSettingsFresh } from "@/lib/data/stitch-kiosk-settings";
import { notifyIntegration } from "@/lib/integrations";
import { applyWorkdayEndCloses } from "@/lib/production/sewing-session-state";
import { isStitchOvertimeWindow } from "@/lib/production/stitch-kiosk-lunch";
import type { SewingSession, SewingSessionsFile } from "@/lib/types/sewing-sessions";

export function stampOvertimeIfNeeded(session: SewingSession, atMs: number): SewingSession {
  if (!isStitchOvertimeWindow(atMs)) return session;
  if (session.overtime_status === "confirmed" || session.overtime_status === "rejected") {
    return session;
  }
  return {
    ...session,
    overtime_status: "pending",
    overtime_logged_at: session.overtime_logged_at ?? new Date(atMs).toISOString(),
  };
}

export const STITCH_WORKDAY_END_ACTOR = "auto-close-22:00-riyadh";

export async function ensureForgottenSessionsClosedAtWorkdayEnd(
  options: { nowMs?: number } = {}
): Promise<{ closed: SewingSession[]; store: SewingSessionsFile }> {
  const nowMs = options.nowMs ?? Date.now();
  const store = await readSewingSessionsFresh();
  const settings = await readStitchKioskSettingsFresh();
  const applied = applyWorkdayEndCloses(store, nowMs, settings.pause_intervals ?? []);
  if (applied.closed.length === 0) {
    return { closed: [], store: applied.store };
  }

  const next = await writeSewingSessions(applied.store);
  for (const session of applied.closed) {
    try {
      await notifyIntegration("production.sewing_session_ended", {
        session_id: session.id,
        kiosk_id: session.kiosk_id,
        employee_id: session.employee_id,
        employee_name: session.employee_name,
        production_code: session.production_code,
        scan_code: session.scan_code,
        started_at: session.started_at,
        ended_at: session.ended_at,
        duration_sec: session.duration_sec,
        via_workday_end: true,
        closed_by: STITCH_WORKDAY_END_ACTOR,
      });
    } catch {
      /* non-fatal */
    }
  }
  return { closed: applied.closed, store: next };
}
