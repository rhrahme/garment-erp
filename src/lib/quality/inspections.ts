import {
  QUALITY_INSPECTION_RESULTS,
  type QualityInspectionRecord,
  type QualityInspectionResult,
} from "@/lib/types/quality";

/**
 * Admin, QC (client_manager), and factory manager (production_operator) log
 * inspections. Logging is QC's core job - never block it for client_manager.
 */
export function canCreateQualityInspection(access: {
  isAdmin?: boolean;
  isClientManager?: boolean;
  isProductionOperator?: boolean;
}): boolean {
  return Boolean(access.isAdmin || access.isClientManager || access.isProductionOperator);
}

export interface QualityInspectionInput {
  inspection_date: string;
  sample_size: number;
  result: QualityInspectionResult;
  notes: string | null;
  work_order_id: string | null;
  work_order_label: string | null;
}

export type ParseInspectionResult =
  | { ok: true; value: QualityInspectionInput }
  | { ok: false; error: string };

function isValidDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

export function parseQualityInspectionInput(body: {
  inspection_date?: unknown;
  sample_size?: unknown;
  result?: unknown;
  notes?: unknown;
  work_order_id?: unknown;
  work_order_label?: unknown;
}): ParseInspectionResult {
  const result = typeof body.result === "string" ? body.result.trim() : "";
  if (!(QUALITY_INSPECTION_RESULTS as readonly string[]).includes(result)) {
    return {
      ok: false,
      error: `result must be one of: ${QUALITY_INSPECTION_RESULTS.join(", ")}.`,
    };
  }

  const sampleSize = Number(body.sample_size);
  if (!Number.isFinite(sampleSize) || !Number.isInteger(sampleSize) || sampleSize < 1) {
    return { ok: false, error: "sample_size must be a whole number of at least 1." };
  }

  const rawDate = typeof body.inspection_date === "string" ? body.inspection_date.trim() : "";
  const inspectionDate = rawDate || new Date().toISOString();
  if (!isValidDate(inspectionDate)) {
    return { ok: false, error: "inspection_date is not a valid date." };
  }

  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const workOrderId =
    typeof body.work_order_id === "string" ? body.work_order_id.trim() : "";
  const workOrderLabel =
    typeof body.work_order_label === "string" ? body.work_order_label.trim() : "";

  return {
    ok: true,
    value: {
      inspection_date: inspectionDate,
      sample_size: sampleSize,
      result: result as QualityInspectionResult,
      notes: notes || null,
      work_order_id: workOrderId || null,
      work_order_label: workOrderLabel || null,
    },
  };
}

export function buildQualityInspectionRecord(
  input: QualityInspectionInput,
  options: { createdBy: string }
): QualityInspectionRecord {
  return {
    id: `qi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...input,
    created_at: new Date().toISOString(),
    created_by: options.createdBy,
  };
}
