import type { SewingKioskUiPhase } from "@/lib/types/sewing-sessions";

export type SewingScanKind = "badge" | "piece" | "unknown";

export type SewingScanFailureReasonCode =
  | "empty_scan"
  | "invalid_badge"
  | "employee_not_found"
  | "employee_inactive"
  | "badge_while_sewing"
  | "piece_not_recognized"
  | "badge_required"
  | "employee_has_open_piece"
  | "ambiguous_employee_arms"
  | "ambiguous_piece_arms"
  | "wrong_piece_for_close"
  | "not_expat_badge"
  // Legacy rows may still store job_not_stitcher from the old tailor-only gate.
  | "job_not_stitcher";

/** One failed stitch-kiosk scan attempt (badge or A4 piece QR). */
export type SewingScanFailure = {
  id: string;
  scanned_at: string;
  kiosk_id: string;
  workstation_id: string | null;
  raw_code: string;
  reason: string;
  reason_code: SewingScanFailureReasonCode;
  scan_kind: SewingScanKind;
  employee_id: string | null;
  employee_name: string | null;
  employee_id_number: string | null;
  related_production_code: string | null;
  related_session_id: string | null;
  arm_employee_id: string | null;
  arm_employee_name: string | null;
  phase: SewingKioskUiPhase;
  source: "erp" | "zapier" | "api";
};

export type SewingScanFailuresFile = {
  updated_at: string | null;
  failures: SewingScanFailure[];
};
