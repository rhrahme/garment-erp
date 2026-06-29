import { listPatternJobsForOrder, readPatternJobs } from "@/lib/data/pattern-jobs";
import {
  detectPatternSalesOrderMismatch,
  orphanPatternJobsToCancel,
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
    error: `${action} would cancel ${pendingCount} pattern job${pendingCount === 1 ? "" : "s"}. SO has ${order.fabric_lines.length} fabric line${order.fabric_lines.length === 1 ? "" : "s"}; verify against ClickUp before cancelling. Pass force_cancel_orphan_jobs: true to proceed.`,
    pending_cancellations: pendingCount,
    fabric_line_count: order.fabric_lines.length,
    active_pattern_job_count: mismatch.active_pattern_job_count,
    mismatch,
  };
}

export function guardLineRemovalPatternSync(
  order: SalesOrder,
  lineId: string,
  forceCancelOrphans: boolean
):
  | { ok: true; pendingCount: number }
  | { ok: false; status: 409; body: PatternSyncGuardError } {
  const pendingCount = patternJobsCancelledByLineRemoval(order, lineId);
  if (pendingCount > 0 && !forceCancelOrphans) {
    return {
      ok: false,
      status: 409,
      body: buildPatternSyncGuardError(order, pendingCount, "Removing this fabric line"),
    };
  }
  return { ok: true, pendingCount };
}

export async function syncPatternJobsWithGuard(
  order: SalesOrder,
  options: { forceCancelOrphans?: boolean; notify?: boolean } = {}
): Promise<
  | { ok: true; result: PatternSyncResult }
  | { ok: false; status: 409; body: PatternSyncGuardError }
> {
  const orphans = orphanPatternJobsToCancel(order, readPatternJobs().jobs);
  if (orphans.length > 0 && !options.forceCancelOrphans) {
    return {
      ok: false,
      status: 409,
      body: buildPatternSyncGuardError(order, orphans.length, "Sync"),
    };
  }

  const result = await syncPatternJobsFromSalesOrder(order, {
    forceCancelOrphans: options.forceCancelOrphans,
    notify: options.notify,
  });
  return { ok: true, result };
}

export async function syncPatternAfterLineRemoval(
  order: SalesOrder,
  forceCancelOrphans: boolean
): Promise<PatternSyncResult> {
  return syncPatternJobsFromSalesOrder(order, { forceCancelOrphans });
}
