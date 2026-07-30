import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { resolveScanEmployeeContext } from "@/lib/hr/payroll-lookup";
import {
  isPatternScanStation,
  patternJobStatusBeforeScan,
  scanAtPatternStation,
} from "@/lib/pattern/pattern-stage-scan";
import { recordProductionScanEvent } from "@/lib/production/record-scan-event";
import {
  scanAtFabricReceivingStation,
  scanAtStation,
  statusBeforeScan,
  type ScanStation,
  type StageScanResult,
} from "@/lib/production/stage-scan";
import type { ProductionScanContext, ScanEmployeeContext } from "@/lib/types/production-scan";

export type ExecuteStageScanInput = {
  code: string;
  station: ScanStation;
  context?: ProductionScanContext;
  employee_id?: string;
  workstation_id?: string | null;
  /** When false, allows legacy single-scan (no employee). Default true for floor stations. */
  require_employee?: boolean;
  /**
   * Pattern context: when no badge is scanned, identity from the logged-in
   * pattern operator session (email / display name).
   */
  session_scanner?: ScanEmployeeContext | null;
  /** Written to pattern_job.updated_by on Pattern station advances. */
  updated_by?: string | null;
  source?: "erp" | "zapier" | "api";
};

export async function executeStageScan(input: ExecuteStageScanInput): Promise<StageScanResult> {
  await ensureDocumentsLoaded([
    "payroll_employees",
    "production_scan_events",
    "pattern_jobs",
    "sales_orders",
  ]);

  const code = input.code.trim();
  const context = input.context ?? "production";
  const requireEmployee = input.require_employee !== false;

  let employee: ScanEmployeeContext | null = null;
  if (input.employee_id?.trim()) {
    employee = resolveScanEmployeeContext({
      employee_id: input.employee_id,
      workstation_id: input.workstation_id,
    });
  } else if (requireEmployee) {
    throw new Error("Scan your employee badge first.");
  } else if (context === "pattern" && input.session_scanner) {
    employee = input.session_scanner;
  }

  const previousStatus =
    context === "pattern"
      ? patternJobStatusBeforeScan(code)
      : statusBeforeScan(code, input.station);

  let result: StageScanResult;
  if (context === "pattern") {
    if (!isPatternScanStation(input.station)) {
      throw new Error(
        "Invalid pattern station - use pattern_tud_ready, pattern_sheet_filled, pattern_handed_to_cut, or pattern_trial_done."
      );
    }
    result = await scanAtPatternStation(code, input.station, {
      updatedBy: input.updated_by ?? employee?.employee_name ?? null,
    });
  } else if (context === "fabric-receiving") {
    result = await scanAtFabricReceivingStation(code, input.station);
  } else {
    if (isPatternScanStation(input.station)) {
      throw new Error("Pattern stations require context=pattern.");
    }
    result = await scanAtStation(code, input.station);
  }

  if (employee) {
    const newStatus =
      result.pattern_job?.status ??
      result.receipt?.status ??
      result.work_order?.status ??
      previousStatus;
    await recordProductionScanEvent({
      result,
      employee,
      context,
      sticker_code: code,
      previous_status: previousStatus,
      new_status: newStatus,
      source: input.source,
    });
  }

  return result;
}
