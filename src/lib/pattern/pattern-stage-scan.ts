import { listPatternJobsForOrder } from "@/lib/data/pattern-jobs";
import { updatePatternJob } from "@/lib/pattern/mutations";
import {
  isTerminalPatternStatus,
  planPatternScan,
  type PatternScanStation,
} from "@/lib/pattern/pattern-stage-scan-plan";
import {
  resolveScanToLine,
  type ScanStation,
  type StageScanNotice,
  type StageScanResult,
} from "@/lib/production/stage-scan";
import {
  fabricLineArticleNumber,
  pieceProductionCodeFromSticker,
  pieceScanAttribution,
  supplierFabricProductionCode,
} from "@/lib/sales-orders/label-codes";
import type { PatternJob } from "@/lib/types/pattern";

export {
  PATTERN_SCAN_STATIONS,
  isPatternScanStation,
  planPatternScan,
  type PatternScanStation,
  type PatternScanTransition,
} from "@/lib/pattern/pattern-stage-scan-plan";

export function findPatternJobForLine(
  salesOrderId: string,
  salesOrderLineId: string
): PatternJob | null {
  const jobs = listPatternJobsForOrder(salesOrderId).filter(
    (job) => job.sales_order_line_id === salesOrderLineId
  );
  if (jobs.length === 0) return null;
  const active = jobs.find((job) => !isTerminalPatternStatus(job.status));
  return active ?? jobs.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null;
}

export function patternJobStatusBeforeScan(scanInput: string): string | null {
  const lookup = resolveScanToLine(scanInput);
  if (!lookup) return null;
  const job = findPatternJobForLine(lookup.order.id, lookup.line.id);
  return job?.status ?? null;
}

/**
 * Scan a manufacturing QR (prep or piece) at a Pattern station.
 * Updates pattern job status; does not change production / receiving floor state.
 */
export async function scanAtPatternStation(
  scanInput: string,
  station: PatternScanStation,
  options: { updatedBy?: string | null } = {}
): Promise<StageScanResult> {
  const lookup = resolveScanToLine(scanInput);
  if (!lookup) {
    throw new Error("Sticker code not recognized - check manufacturing QR on the size sheet.");
  }

  const { order, line, sticker } = lookup;
  const job = findPatternJobForLine(order.id, line.id);
  if (!job) {
    throw new Error("No pattern job for this fabric line - sync pattern jobs from the sales order.");
  }

  const siblings = line.label_stickers ?? [sticker];
  const production_code = pieceProductionCodeFromSticker(sticker, order.client_code, siblings);
  const attribution = pieceScanAttribution(sticker, order.client_code, siblings);
  const lineIndex = order.fabric_lines.findIndex((fabricLine) => fabricLine.id === line.id);
  const base = {
    station: station as ScanStation,
    client_code: order.client_code,
    client_name: order.client_name?.trim() || "-",
    production_code,
    fabric_cut_code: supplierFabricProductionCode(sticker.code, order.client_code),
    article_number: fabricLineArticleNumber(lineIndex >= 0 ? lineIndex : 0),
    garment_type: line.garment_type,
    so_number: order.so_number,
    piece_name: attribution.piece_name,
    piece_abbrev: attribution.piece_abbrev,
    piece_index: attribution.piece_index,
    piece_total: attribution.piece_total,
    piece_mark: attribution.piece_mark,
    fabric_number: line.fabric_number,
  };

  const plan = planPatternScan(station, job.status);
  if (plan.kind === "reject") {
    throw new Error(plan.message);
  }

  if (plan.kind === "check_in") {
    return {
      ...base,
      message: `${plan.message} (${job.so_number} L${String(job.article_number).padStart(2, "0")}).`,
      notice: "checked_in" as StageScanNotice,
      pattern_job: job,
    };
  }

  const updated = await updatePatternJob(
    job.id,
    { status: plan.status },
    { updatedBy: options.updatedBy ?? null }
  );
  if (!updated.ok) {
    throw new Error(updated.error);
  }

  return {
    ...base,
    message: `${plan.message} (${updated.job.so_number} L${String(updated.job.article_number).padStart(2, "0")}).`,
    notice: "advanced" as StageScanNotice,
    pattern_job: updated.job,
  };
}
