import type { EmployeeJobFunction } from "@/lib/hr/job-functions";

export type SewingSessionStatus = "open" | "closing" | "closed" | "abandoned";

/** How the piece session was armed — normal badge EMP: vs Alteration EMPALT:. */
export type SewingWorkKind = "first_make" | "alteration";

/** Short-lived: badge scanned, waiting for A4 piece QR. */
export type SewingKioskArm = {
  kiosk_id: string;
  employee_id: string;
  employee_name: string;
  employee_id_number: string;
  workstation_id: string | null;
  armed_at: string;
  /** Set when armed via EMPALT: alteration badge QR. */
  work_kind?: SewingWorkKind | null;
  /**
   * Role chosen by EMPIRON / EMPBTN dual-role badges.
   * Live labels use this instead of the full job_functions priority list.
   */
  activity_job_function?: Extract<EmployeeJobFunction, "wash_iron" | "buttons"> | null;
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
  supplier_id: string | null;
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
  /** Mill id from the SO line -- used for stitch kiosk color / swatch preview. */
  supplier_id?: string | null;
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
  /**
   * Client first+last (no middle) when resolved from profiles on the dashboard.
   * UI should prefer this over client_name via sewingSessionClientDisplayName.
   */
  client_short_name?: string | null;
  /**
   * Alteration when started via EMPALT: badge QR; otherwise first_make / unset.
   * Live / History show Alteration without replacing job_functions activity.
   */
  work_kind?: SewingWorkKind | null;
  /**
   * Role chosen by EMPIRON / EMPBTN when the session started.
   * Live / History show Ironing or Buttons for that session.
   */
  activity_job_function?: Extract<EmployeeJobFunction, "wash_iron" | "buttons"> | null;
  /**
   * Scan at/after 22:00 Riyadh (overtime). Logged immediately; admin confirms later.
   * rejected keeps the row but drops it from Performance totals.
   */
  overtime_status?: "pending" | "confirmed" | "rejected" | null;
  overtime_logged_at?: string | null;
  overtime_decided_by?: string | null;
  overtime_decided_at?: string | null;
};

export type SewingSessionsFile = {
  updated_at: string | null;
  kiosk_arms: SewingKioskArm[];
  /** Piece-first pending starts (A4 before badge). */
  kiosk_piece_arms?: SewingKioskPieceArm[];
  sessions: SewingSession[];
  /** Admin-approved deletes. Protect-merge drops these ids if a stale kiosk write tries to resurrect them. */
  deleted_session_ids?: string[];
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
  /** Reject path persisted to sewing_scan_failures (after retries). */
  failure_recorded?: boolean;
  /**
   * Server accepted the scan for durable storage (success write or failure log).
   * Kiosk may dequeue only when durable is true (or ok is true).
   */
  durable?: boolean;
  /** Machine-readable reject reason when ok is false (e.g. kiosk_paused). */
  reason_code?: string;
  /** Admin pause flag mirrored on scan responses for kiosk UI. */
  kiosk_paused?: boolean;
  /** When paused, Live/Scan clocks freeze at this timestamp. */
  kiosk_paused_at?: string | null;
};
