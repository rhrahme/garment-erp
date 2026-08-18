import type {
  SewingSessionChangeAction,
  SewingSessionChangeRequest,
} from "@/lib/types/sewing-session-change-requests";

export function summarizeSewingSessionChangeRequest(
  request: SewingSessionChangeRequest
): {
  id: string;
  action: SewingSessionChangeAction;
  status: string;
  session_id: string | null;
  failure_id: string | null;
  label: string;
  production_code: string | null;
  fabric_number: string | null;
  employee_name: string | null;
  so_number: string | null;
  requested_by: string;
  requested_at: string;
  reason: string | null;
} {
  const snap = request.session_snapshot;
  const fail = request.failure_snapshot;
  const label =
    request.action === "pause_kiosk"
      ? "Pause stitch kiosk"
      : request.action === "delete_failure"
        ? `Delete failed scan ${fail?.raw_code ?? request.failure_id ?? ""}`
        : request.action === "overtime_confirm"
          ? `Overtime to confirm ${snap?.production_code ?? request.session_id ?? "session"}`
          : `${request.action} ${snap?.production_code ?? request.session_id ?? "session"}`;
  return {
    id: request.id,
    action: request.action,
    status: request.status,
    session_id: request.session_id,
    failure_id: request.failure_id,
    label,
    production_code: snap?.production_code ?? fail?.related_production_code ?? null,
    fabric_number: snap?.fabric_number ?? null,
    employee_name: snap?.employee_name ?? fail?.employee_name ?? null,
    so_number: snap?.so_number ?? null,
    requested_by: request.requested_by,
    requested_at: request.requested_at,
    reason: request.reason,
  };
}
