import { appendSewingScanFailure } from "@/lib/data/sewing-scan-failures";
import { notifyIntegration } from "@/lib/integrations";
import {
  buildSewingScanFailure,
  type BuildSewingScanFailureInput,
} from "@/lib/production/sewing-scan-failure-build";
import type { SewingScanFailure } from "@/lib/types/sewing-scan-failures";

export type { BuildSewingScanFailureInput as RecordSewingScanFailureInput };
export { buildSewingScanFailure };

export async function recordSewingScanFailure(
  input: BuildSewingScanFailureInput
): Promise<SewingScanFailure> {
  const failure = buildSewingScanFailure(input);
  await appendSewingScanFailure(failure, input.now ?? Date.now());

  await notifyIntegration(
    "production.sewing_scan_failed",
    {
      failure_id: failure.id,
      scanned_at: failure.scanned_at,
      kiosk_id: failure.kiosk_id,
      workstation_id: failure.workstation_id,
      raw_code: failure.raw_code,
      reason: failure.reason,
      reason_code: failure.reason_code,
      scan_kind: failure.scan_kind,
      employee_id: failure.employee_id,
      employee_name: failure.employee_name,
      employee_id_number: failure.employee_id_number,
      related_production_code: failure.related_production_code,
      related_session_id: failure.related_session_id,
      arm_employee_id: failure.arm_employee_id,
      arm_employee_name: failure.arm_employee_name,
      phase: failure.phase,
    },
    failure.source
  );

  return failure;
}
