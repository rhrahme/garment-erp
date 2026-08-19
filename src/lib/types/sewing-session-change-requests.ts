import type { EmployeeJobFunction } from "@/lib/hr/job-functions";
import type { SewingScanFailure } from "@/lib/types/sewing-scan-failures";
import type { SewingSession, SewingWorkKind } from "@/lib/types/sewing-sessions";

export type SewingSessionChangeRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export type SewingSessionChangeAction =
  | "delete"
  | "stop"
  | "edit"
  | "pause_kiosk"
  | "delete_failure"
  | "overtime_confirm";

/** Fields operators may propose when action is edit. */
export type SewingSessionEditPatch = {
  employee_id_number?: string | null;
  production_code?: string | null;
  scan_code?: string | null;
  piece_mark?: string | null;
  fabric_number?: string | null;
  garment_type?: string | null;
  client_name?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  work_kind?: SewingWorkKind | null;
  activity_job_function?: Extract<
    EmployeeJobFunction,
    "wash_iron" | "buttons" | "washing"
  > | null;
};

export type SewingSessionChangeSnapshot = Pick<
  SewingSession,
  | "id"
  | "status"
  | "employee_id"
  | "employee_name"
  | "employee_id_number"
  | "production_code"
  | "scan_code"
  | "piece_mark"
  | "fabric_number"
  | "garment_type"
  | "client_name"
  | "so_number"
  | "started_at"
  | "ended_at"
  | "duration_sec"
  | "work_kind"
  | "activity_job_function"
  | "kiosk_id"
>;

export type SewingScanFailureChangeSnapshot = Pick<
  SewingScanFailure,
  | "id"
  | "scanned_at"
  | "raw_code"
  | "reason"
  | "reason_code"
  | "scan_kind"
  | "employee_name"
  | "employee_id_number"
  | "related_production_code"
  | "kiosk_id"
>;

export type SewingSessionChangeRequest = {
  id: string;
  status: SewingSessionChangeRequestStatus;
  action: SewingSessionChangeAction;
  session_id: string | null;
  failure_id: string | null;
  session_snapshot: SewingSessionChangeSnapshot | null;
  failure_snapshot: SewingScanFailureChangeSnapshot | null;
  proposed_patch: SewingSessionEditPatch | null;
  reason: string | null;
  requested_by: string;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
};

export type SewingSessionChangeRequestsFile = {
  updated_at: string | null;
  requests: SewingSessionChangeRequest[];
};
