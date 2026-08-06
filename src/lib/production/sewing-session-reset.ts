import { writeSewingScanFailures } from "@/lib/data/sewing-scan-failures";
import { readSewingSessionsFresh, writeSewingSessions } from "@/lib/data/sewing-sessions";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  listOutstandingPatternAlterationPending,
  updatePatternAlterationPending,
} from "@/lib/data/pattern-alteration-pending";
import { notifyIntegration } from "@/lib/integrations";

export type SewingSessionTestingResetInput = {
  /** Also clear closed history (default true for a clean floor test). */
  clear_history?: boolean;
  /** Clear sewing_scan_failures audit log (default true). */
  clear_failures?: boolean;
  /** Mark open pattern alteration-pending rows chart_updated (default true). */
  clear_alteration_pending?: boolean;
  cleared_by?: string | null;
};

export type SewingSessionTestingResetResult = {
  cleared_arms: number;
  cleared_piece_arms: number;
  cleared_open_sessions: number;
  cleared_closed_sessions: number;
  cleared_failures: boolean;
  cleared_alteration_pending: number;
};

export async function resetSewingSessionsForTesting(
  input: SewingSessionTestingResetInput = {},
  source: "erp" | "api" = "erp"
): Promise<SewingSessionTestingResetResult> {
  await ensureDocumentsLoaded([
    "sewing_sessions",
    "sewing_scan_failures",
    "pattern_alteration_pending",
  ]);

  const previous = await readSewingSessionsFresh();
  const openSessions = previous.sessions.filter(
    (session) => session.status === "open" || session.status === "closing"
  );
  const closedSessions = previous.sessions.filter((session) => session.status === "closed");
  const keepHistory = input.clear_history === false;

  await writeSewingSessions(
    {
      updated_at: null,
      kiosk_arms: [],
      kiosk_piece_arms: [],
      sessions: keepHistory ? closedSessions : [],
    },
    { allowTestingReset: true }
  );

  let clearedFailures = false;
  if (input.clear_failures !== false) {
    await writeSewingScanFailures(
      { updated_at: null, failures: [] },
      { allowTestingReset: true }
    );
    clearedFailures = true;
  }

  let clearedAlterationPending = 0;
  if (input.clear_alteration_pending !== false) {
    const outstanding = listOutstandingPatternAlterationPending(500);
    const by = input.cleared_by?.trim() || "sewing-testing-reset";
    const at = new Date().toISOString();
    for (const item of outstanding) {
      await updatePatternAlterationPending(item.id, {
        status: "chart_updated",
        chart_updated_at: at,
        chart_updated_by: by,
        acknowledged_at: item.acknowledged_at ?? at,
        acknowledged_by: item.acknowledged_by ?? by,
      });
      clearedAlterationPending += 1;
    }
  }

  const result: SewingSessionTestingResetResult = {
    cleared_arms: previous.kiosk_arms.length,
    cleared_piece_arms: previous.kiosk_piece_arms.length,
    cleared_open_sessions: openSessions.length,
    cleared_closed_sessions: keepHistory ? 0 : closedSessions.length,
    cleared_failures: clearedFailures,
    cleared_alteration_pending: clearedAlterationPending,
  };

  await notifyIntegration(
    "production.sewing_testing_reset",
    {
      ...result,
      cleared_by: input.cleared_by ?? null,
    },
    source
  );

  return result;
}
