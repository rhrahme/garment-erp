import { employeeDisplayNameById } from "@/lib/hr/payroll-lookup";
import {
  findFabricClientOwnership,
  formatFabricClientOwnership,
} from "@/lib/sales-orders/fabric-client-ownership";
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
  garment_type: string | null;
  employee_name: string | null;
  so_number: string | null;
  client_name: string | null;
  source_client_name: string | null;
  destination_client_name: string | null;
  client_label: string | null;
  started_at: string | null;
  original_started_at: string | null;
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
          : request.action === "started_without_qr"
            ? `Started without QR ${snap?.production_code ?? request.session_id ?? "session"}`
            : request.action === "correct_start_time"
              ? `Corrected start time ${snap?.production_code ?? request.session_id ?? "session"}`
              : `${request.action} ${snap?.production_code ?? request.session_id ?? "session"}`;
  const ownership = findFabricClientOwnership({
    soNumber: snap?.so_number,
    fabricNumber: snap?.fabric_number,
    productionCode: snap?.production_code ?? fail?.related_production_code,
    fallbackClientName: snap?.client_name,
  });
  const clientLabel = formatFabricClientOwnership({
    currentClientName: ownership.current_client_name,
    sourceClientName: ownership.source_client_name,
    destinationClientName: ownership.destination_client_name,
  });
  return {
    id: request.id,
    action: request.action,
    status: request.status,
    session_id: request.session_id,
    failure_id: request.failure_id,
    label,
    production_code: snap?.production_code ?? fail?.related_production_code ?? null,
    fabric_number: snap?.fabric_number ?? null,
    garment_type: snap?.garment_type ?? null,
    employee_name: employeeDisplayNameById(
      snap?.employee_id,
      snap?.employee_short_name ?? snap?.employee_name ?? fail?.employee_name ?? null
    ),
    so_number: snap?.so_number ?? null,
    client_name: ownership.current_client_name || snap?.client_name || null,
    source_client_name: ownership.source_client_name,
    destination_client_name: ownership.destination_client_name,
    client_label: clientLabel || null,
    started_at:
      request.action === "correct_start_time"
        ? request.proposed_patch?.started_at ?? snap?.started_at ?? null
        : snap?.started_at ?? null,
    original_started_at:
      request.action === "correct_start_time" ? snap?.started_at ?? null : null,
    requested_by: request.requested_by,
    requested_at: request.requested_at,
    reason: request.reason,
  };
}
