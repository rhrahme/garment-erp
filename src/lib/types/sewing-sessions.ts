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
  work_order_id: string | null;
  so_number: string | null;
  piece_mark: string | null;
  fabric_cut_code: string | null;
  client_name: string | null;
};

export type SewingSessionsFile = {
  updated_at: string | null;
  kiosk_arms: SewingKioskArm[];
  sessions: SewingSession[];
};

export type SewingKioskUiPhase =
  | "idle"
  | "identity_armed"
  | "piece_open"
  | "piece_closing";

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
};
