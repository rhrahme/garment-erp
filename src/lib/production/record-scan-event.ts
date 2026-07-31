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
    fabric_prep_step: input.result.receipt?.fabric_prep_step ?? null,
    workstation_id: input.employee.workstation_id,
    notice: input.result.notice,
    piece_name: input.result.piece_name ?? null,
    piece_abbrev: input.result.piece_abbrev ?? null,
    piece_index: input.result.piece_index ?? null,
    piece_total: input.result.piece_total ?? null,
    piece_mark: input.result.piece_mark ?? null,
  };

  await appendProductionScanEvent(event);

  const payload = {
    scan_event_id: event.id,
    employee_id: event.employee_id,
    employee_name: event.employee_name,
    station: event.station,
    context: event.context,
    sticker_code: event.sticker_code,
    fabric_cut_code: event.fabric_cut_code,
    work_order_id: event.work_order_id,
    pattern_job_id: input.result.pattern_job?.id ?? null,
    previous_status: event.previous_status,
    new_status: event.new_status,
    fabric_prep_step: event.fabric_prep_step,
    workstation_id: event.workstation_id,
    notice: event.notice,
    so_number: event.so_number,
    piece_name: event.piece_name,
    piece_abbrev: event.piece_abbrev,
    piece_index: event.piece_index,
    piece_total: event.piece_total,
    piece_mark: event.piece_mark,
  };

  await notifyIntegration(
    input.context === "pattern" ? "pattern.scan" : "production.scan",
    payload,
    input.source ?? "erp"
  );
}
