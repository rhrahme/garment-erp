import type { EmployeeJobFunction } from "@/lib/hr/job-functions";

export type SewingSessionStatus = "open" | "closing" | "closed" | "abandoned";

/** Short-lived: badge scanned, waiting for A4 piece QR. */
export type SewingKioskArm = {
  kiosk_id: string;
  employee_id: string;
  employee_name: string;
  employee_id_number: string;
  workstation_id: string | null;
  armed_at: string;
};

/** Short-lived: A4 scanned first, waiting for idle employee badge to start. */
export type SewingKioskPieceArm = {
  kiosk_id: string;
  production_code: string;
  scan_code: string;
  so_number: string | null;
  piece_mark: string | null;
  fabric_cut_code: string | null;
  client_name: string | null;
  garment_type: string | null;
  fabric_number: string | null;
  work_order_id: string | null;
  armed_at: string;
};

export type SewingSessionClosingConfirm = "badge" | "piece";

export type SewingSession = {
  id: string;
  kiosk_id: string;
  employee_id: string;
  employee_name: string;
  employee_id_number: string;
  production_code: string;
  /** Raw scan that opened the session (may be short A4 form). */
  scan_code: string;
  workstation_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_sec: number | null;
  status: SewingSessionStatus;
  /** When piece was re-scanned to start close; needs matching EMP. */
  closing_armed_at: string | null;
  /**
   * Which scan confirms finish while status is closing.
   * - badge: A4-first close (default / legacy)
   * - piece: badge-first close recovery
   */
  closing_confirm?: SewingSessionClosingConfirm | null;
  work_order_id: string | null;
  so_number: string | null;
  piece_mark: string | null;
  fabric_cut_code: string | null;
  client_name: string | null;
  /** Optional enrichments from sticker lookup (may be null on older sessions). */
  garment_type?: string | null;
  fabric_number?: string | null;
  /**
   * HR job roles for status display (Cutting vs Sewing, etc.).
   * Dashboard payloads join from payroll; not required on persisted session rows.
   */
  job_functions?: EmployeeJobFunction[] | null;
  /**
   * Badge short name from payroll when available (dashboard join).
   * UI should prefer this over employee_name via sewingSessionEmployeeDisplayName.
   */
  employee_short_name?: string | null;
};

export type SewingSessionsFile = {
  updated_at: string | null;
  kiosk_arms: SewingKioskArm[];
  /** Piece-first pending starts (A4 before badge). */
  kiosk_piece_arms?: SewingKioskPieceArm[];
  sessions: SewingSession[];
};

export type SewingKioskUiPhase =
  | "idle"
  | "identity_armed"
  | "piece_armed"
  | "piece_open"
  | "piece_closing";

export type SewingSessionRecovery = "piece_first_start" | "badge_first_close";

export type SewingKioskScanResult = {
  ok: boolean;
  message: string;
  phase: SewingKioskUiPhase;
  beep: "ok" | "error" | "progress";
  arm: SewingKioskArm | null;
  session: SewingSession | null;
  /** Active open/closing sessions on this kiosk (many stitchers). */
  open_sessions?: SewingSession[];
  duration_sec?: number | null;
  stage_advanced?: boolean;
  /** True when an out-of-order scan was accepted unambiguously. */
  recovered?: boolean;
  recovery?: SewingSessionRecovery;
  piece_arm?: SewingKioskPieceArm | null;
};
