import { appendProductionScanEvent } from "@/lib/data/production-scan-events";
import { notifyIntegration } from "@/lib/integrations";
import type { ProductionScanContext, ScanEmployeeContext } from "@/lib/types/production-scan";
import type { StageScanResult, ScanStation } from "@/lib/production/stage-scan";

function statusFromResult(result: StageScanResult): { previous: string | null; next: string | null } {
  const receipt = result.receipt;
  const workOrder = result.work_order;

  if (receipt) {
    if (result.notice === "created") {
      return { previous: "pending", next: receipt.status };
    }
    if (result.notice === "advanced") {
      return { previous: receipt.status, next: receipt.status };
    }
    return { previous: receipt.status, next: receipt.status };
  }

  if (workOrder) {
    return { previous: workOrder.status, next: workOrder.status };
  }

  return { previous: null, next: null };
}

export async function recordProductionScanEvent(input: {
  result: StageScanResult;
  employee: ScanEmployeeContext;
  context: ProductionScanContext;
  sticker_code: string;
  previous_status?: string | null;
  new_status?: string | null;
  source?: "erp" | "zapier" | "api";
}): Promise<void> {
  const derived = statusFromResult(input.result);
  const previous_status = input.previous_status ?? derived.previous;
  const new_status = input.new_status ?? derived.next;

  const event = {
    id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    scanned_at: new Date().toISOString(),
    employee_id: input.employee.employee_id,
    employee_name: input.employee.employee_name,
    employee_id_number: input.employee.employee_id_number,
    station: input.result.station as ScanStation,
    context: input.context,
    sticker_code: input.sticker_code.trim().toUpperCase(),
    fabric_cut_code: input.result.fabric_cut_code,
    so_number: input.result.so_number,
    work_order_id: input.result.work_order?.id ?? null,
    previous_status,
    new_status,
    workstation_id: input.employee.workstation_id,
    notice: input.result.notice,
  };

  await appendProductionScanEvent(event);

  await notifyIntegration(
    "production.scan",
    {
      scan_event_id: event.id,
      employee_id: event.employee_id,
      employee_name: event.employee_name,
      station: event.station,
      context: event.context,
      sticker_code: event.sticker_code,
      fabric_cut_code: event.fabric_cut_code,
      work_order_id: event.work_order_id,
      previous_status: event.previous_status,
      new_status: event.new_status,
      workstation_id: event.workstation_id,
      notice: event.notice,
      so_number: event.so_number,
    },
    input.source ?? "erp"
  );
}
