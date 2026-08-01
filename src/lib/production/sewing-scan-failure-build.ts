import type {
  SewingScanFailure,
  SewingScanFailureReasonCode,
  SewingScanKind,
} from "@/lib/types/sewing-scan-failures";
import type { SewingKioskUiPhase } from "@/lib/types/sewing-sessions";

/** Keep at most this many newest failures (hard cap against unbounded growth). */
export const SEWING_SCAN_FAILURE_MAX_ROWS = 2000;
/** Drop failures older than this many days when appending. */
export const SEWING_SCAN_FAILURE_RETENTION_DAYS = 30;

/**
 * Retention: keep the newest SEWING_SCAN_FAILURE_MAX_ROWS rows and drop anything
 * older than SEWING_SCAN_FAILURE_RETENTION_DAYS (whichever prunes more). Failures
 * are audit noise, not session history, so a short window is enough for QC review.
 */
export function pruneSewingScanFailures(
  failures: SewingScanFailure[],
  at = Date.now()
): SewingScanFailure[] {
  const cutoffMs = at - SEWING_SCAN_FAILURE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return failures
    .filter((row) => {
      const t = new Date(row.scanned_at).getTime();
      return Number.isFinite(t) && t >= cutoffMs;
    })
    .slice(0, SEWING_SCAN_FAILURE_MAX_ROWS);
}

export type BuildSewingScanFailureInput = {
  raw_code: string;
  reason: string;
  reason_code: SewingScanFailureReasonCode;
  scan_kind: SewingScanKind;
  kiosk_id: string;
  workstation_id?: string | null;
  employee_id?: string | null;
  employee_name?: string | null;
  employee_id_number?: string | null;
  related_production_code?: string | null;
  related_session_id?: string | null;
  arm_employee_id?: string | null;
  arm_employee_name?: string | null;
  phase: SewingKioskUiPhase;
  source?: "erp" | "zapier" | "api";
  now?: number;
};

export function buildSewingScanFailure(
  input: BuildSewingScanFailureInput
): SewingScanFailure {
  const at = input.now ?? Date.now();
  return {
    id: `sew-fail-${at}-${Math.random().toString(36).slice(2, 8)}`,
    scanned_at: new Date(at).toISOString(),
    kiosk_id: input.kiosk_id.trim() || "default",
    workstation_id: input.workstation_id ?? null,
    raw_code: input.raw_code,
    reason: input.reason,
    reason_code: input.reason_code,
    scan_kind: input.scan_kind,
    employee_id: input.employee_id ?? null,
    employee_name: input.employee_name ?? null,
    employee_id_number: input.employee_id_number ?? null,
    related_production_code: input.related_production_code ?? null,
    related_session_id: input.related_session_id ?? null,
    arm_employee_id: input.arm_employee_id ?? null,
    arm_employee_name: input.arm_employee_name ?? null,
    phase: input.phase,
    source: input.source ?? "erp",
  };
}
