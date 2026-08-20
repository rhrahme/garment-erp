import { listPatternJobsForOrder, readPatternJobs } from "@/lib/data/pattern-jobs";
import {
  detectPatternSalesOrderMismatch,
  type PatternSalesOrderMismatch,
} from "@/lib/sales-orders/pattern-so-mismatch";
import { syncPatternJobsFromSalesOrder, type PatternSyncResult } from "@/lib/pattern/sync-from-sales-order";
import type { SalesOrder } from "@/lib/types/sales-orders";

export function activePatternJobsForLine(
  salesOrderId: string,
  lineId: string
): number {
  return listPatternJobsForOrder(salesOrderId).filter(
    (job) =>
      job.sales_order_line_id === lineId &&
      job.status !== "cancelled" &&
      job.status !== "completed"
  ).length;
}

export function patternJobsCancelledByLineRemoval(
  order: SalesOrder,
  lineId: string
): number {
  return activePatternJobsForLine(order.id, lineId);
}

export function getPatternMismatchForOrder(order: SalesOrder): PatternSalesOrderMismatch {
  const jobs = readPatternJobs().jobs;
  return detectPatternSalesOrderMismatch(order, jobs);
}

export type PatternSyncGuardError = {
  error: string;
  pending_cancellations: number;
  fabric_line_count: number;
  active_pattern_job_count: number;
  mismatch: PatternSalesOrderMismatch;
};

export function buildPatternSyncGuardError(
  order: SalesOrder,
  pendingCount: number,
  action: string
): PatternSyncGuardError {
  const mismatch = getPatternMismatchForOrder(order);
  return {
    error: `${action} would cancel ${pendingCount} pattern job${pendingCount === 1 ? "" : "s"} for fabrics no longer on this sales order. ERP is the source of truth. Pass force_cancel_orphan_jobs: true to proceed.`,
    pending_cancellations: pendingCount,
    fabric_line_count: order.fabric_lines.length,
    active_pattern_job_count: mismatch.active_pattern_job_count,
    mismatch,
  };
}

export function guardLineRemovalPatternSync(
  order: SalesOrder,
  lineId: string,
  _forceCancelOrphans?: boolean
):
  | { ok: true; pendingCount: number }
  | { ok: false; status: 409; body: PatternSyncGuardError } {
  void _forceCancelOrphans;
  // ERP is the source of truth. Removing a fabric always cancels its
  // leftover pattern jobs - no ClickUp check.
  return { ok: true, pendingCount: patternJobsCancelledByLineRemoval(order, lineId) };
}

export async function syncPatternJobsWithGuard(
  order: SalesOrder,
  options: { forceCancelOrphans?: boolean; notify?: boolean } = {}
): Promise<
  | { ok: true; result: PatternSyncResult }
  | { ok: false; status: 409; body: PatternSyncGuardError }
> {
  const result = await syncPatternJobsFromSalesOrder(order, {
    forceCancelOrphans: options.forceCancelOrphans !== false,
    notify: options.notify,
  });
  return { ok: true, result };
}

export async function syncPatternAfterLineRemoval(
  order: SalesOrder,
  _forceCancelOrphans?: boolean
): Promise<PatternSyncResult> {
  void _forceCancelOrphans;
  return syncPatternJobsFromSalesOrder(order, { forceCancelOrphans: true });
}
