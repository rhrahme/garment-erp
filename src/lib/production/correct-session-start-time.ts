import { createSewingSessionChangeRequest } from "@/lib/production/sewing-session-change-requests";
import { validateManualStartAt } from "@/lib/production/manual-start-time";

export type CorrectSessionStartTimeInput = {
  session_id: string;
  started_at: string;
  reason?: string | null;
  requested_by: string;
  now?: number;
  source?: "erp" | "api";
};

type ResultOk<T> = { ok: true } & T;
type ResultErr = { ok: false; status: number; error: string };

export async function correctSewingSessionStartTime(
  input: CorrectSessionStartTimeInput
): Promise<ResultOk<{ request_id: string; started_at: string }> | ResultErr> {
  const requestedBy = input.requested_by.trim();
  if (!requestedBy) {
    return { ok: false, status: 400, error: "requested_by is required." };
  }
  const sessionId = input.session_id.trim();
  if (!sessionId) {
    return { ok: false, status: 400, error: "session_id is required." };
  }

  const early = validateManualStartAt(input.started_at, input.now ?? Date.now());
  if (!early.ok) {
    return { ok: false, status: 400, error: early.error };
  }

  const created = await createSewingSessionChangeRequest(
    {
      action: "correct_start_time",
      session_id: sessionId,
      proposed_patch: { started_at: new Date(early.atMs).toISOString() },
      reason: input.reason,
      requested_by: requestedBy,
    },
    input.source ?? "erp"
  );
  if (!created.ok) return created;
  return {
    ok: true,
    request_id: created.request.id,
    started_at: created.request.proposed_patch?.started_at ?? new Date(early.atMs).toISOString(),
  };
}
