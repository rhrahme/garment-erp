import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { resolveScanEmployeeContext } from "@/lib/hr/payroll-lookup";
import { recordProductionScanEvent } from "@/lib/production/record-scan-event";
import {
  scanAtFabricReceivingStation,
  scanAtStation,
  statusBeforeScan,
  type ScanStation,
  type StageScanResult,
} from "@/lib/production/stage-scan";
import type { ProductionScanContext } from "@/lib/types/production-scan";

export type ExecuteStageScanInput = {
  code: string;
  station: ScanStation;
  context?: ProductionScanContext;
  employee_id?: string;
  workstation_id?: string | null;
  /** When false, allows legacy single-scan (no employee). Default true for floor stations. */
  require_employee?: boolean;
  source?: "erp" | "zapier" | "api";
};

export async function executeStageScan(input: ExecuteStageScanInput): Promise<StageScanResult> {
  await ensureDocumentsLoaded(["payroll_employees", "production_scan_events"]);

  const code = input.code.trim();
  const context = input.context ?? "production";
  const requireEmployee = input.require_employee !== false;

  let employee = null;
  if (requireEmployee) {
    if (!input.employee_id?.trim()) {
      throw new Error("Scan your employee badge first.");
    }
    employee = resolveScanEmployeeContext({
      employee_id: input.employee_id,
      workstation_id: input.workstation_id,
    });
  }

  const previousStatus = statusBeforeScan(code, input.station);

  const result =
    context === "fabric-receiving"
      ? await scanAtFabricReceivingStation(code, input.station)
      : await scanAtStation(code, input.station);

  if (employee) {
    const newStatus = result.receipt?.status ?? result.work_order?.status ?? previousStatus;
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
