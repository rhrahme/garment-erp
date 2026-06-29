import fs from "fs";
import path from "path";
import type { ClickUpTask } from "@/lib/integrations/clickup/types";
import type { PatternJob } from "@/lib/types/pattern";
import type { SalesOrder } from "@/lib/types/sales-orders";

const CLICKUP_CACHE_DIR = path.join(
  process.cwd(),
  "src/data/.clickup-cache-build/detailed"
);

/** ClickUp task id in parentheses, e.g. `ClickUp: Blair Maxwell (86exhyjr1)` */
const CLICKUP_NOTE_ID_RE = /\(([a-z0-9]+)\)/gi;

export interface PatternSalesOrderMismatch {
  has_mismatch: boolean;
  fabric_line_count: number;
  active_pattern_job_count: number;
  /** Active pattern jobs whose sales_order_line_id is not on the current SO. */
  stale_line_ids: string[];
  /** Pattern job ids that would be cancelled if sync ran without force. */
  orphan_job_ids: string[];
  clickup_task_ids: string[];
  /** Sum of garment line tasks from ClickUp cache when available. */
  clickup_line_count: number | null;
  imported_from_clickup: boolean;
}

function activeJobsForOrder(jobs: PatternJob[], salesOrderId: string): PatternJob[] {
  return jobs.filter((job) => job.sales_order_id === salesOrderId && job.status !== "cancelled");
}

export function extractClickUpTaskIds(notes: string | null | undefined, orderId?: string): string[] {
  const ids = new Set<string>();

  if (notes) {
    for (const match of notes.matchAll(CLICKUP_NOTE_ID_RE)) {
      const id = match[1]?.trim();
      if (id) ids.add(id);
    }
  }

  const fromOrderId = orderId?.match(/^so-cu-([a-z0-9]+)$/i)?.[1];
  if (fromOrderId) ids.add(fromOrderId);

  return [...ids];
}

function isClickUpGarmentLineTask(task: ClickUpTask): boolean {
  const fields = task.custom_fields ?? [];
  const item = fields.find((field) => field.name === "Item");
  const fabric = fields.find((field) => field.name === "Fabric Number");
  const itemValue = item?.value != null && item.value !== "";
  const fabricValue = fabric?.value != null && String(fabric.value).trim() !== "";
  return Boolean(itemValue || fabricValue);
}

function collectLineTasksFromSubtasks(subtasks: ClickUpTask[]): ClickUpTask[] {
  const lineTasks: ClickUpTask[] = [];
  for (const subtask of subtasks) {
    if (isClickUpGarmentLineTask(subtask)) {
      lineTasks.push(subtask);
    }
    if (subtask.subtasks?.length) {
      lineTasks.push(...collectLineTasksFromSubtasks(subtask.subtasks));
    }
  }
  return lineTasks;
}

/** Count garment line subtasks from a ClickUp detailed cache file, if present. */
export function countClickUpGarmentLinesFromCache(taskId: string): number | null {
  const cachePath = path.join(CLICKUP_CACHE_DIR, `${taskId}.json`);
  if (!fs.existsSync(cachePath)) return null;

  try {
    const task = JSON.parse(fs.readFileSync(cachePath, "utf8")) as ClickUpTask;
    const subtasks = task.subtasks ?? [];
    if (subtasks.length === 0) return null;

    return collectLineTasksFromSubtasks(subtasks).length;
  } catch {
    return null;
  }
}

export function countClickUpGarmentLines(taskIds: string[]): number | null {
  if (taskIds.length === 0) return null;

  let total = 0;
  let anyKnown = false;

  for (const taskId of taskIds) {
    const count = countClickUpGarmentLinesFromCache(taskId);
    if (count != null) {
      anyKnown = true;
      total += count;
    }
  }

  return anyKnown ? total : null;
}

export function orphanPatternJobsToCancel(
  order: SalesOrder,
  jobs: PatternJob[]
): PatternJob[] {
  const lineIds = new Set(order.fabric_lines.map((line) => line.id));
  return jobs.filter(
    (job) =>
      job.sales_order_id === order.id &&
      !lineIds.has(job.sales_order_line_id) &&
      job.status !== "cancelled" &&
      job.status !== "completed"
  );
}

export function detectPatternSalesOrderMismatch(
  order: SalesOrder,
  jobs: PatternJob[]
): PatternSalesOrderMismatch {
  const lineIds = new Set(order.fabric_lines.map((line) => line.id));
  const activeJobs = activeJobsForOrder(jobs, order.id);
  const staleLineIds = [
    ...new Set(
      activeJobs
        .filter((job) => !lineIds.has(job.sales_order_line_id))
        .map((job) => job.sales_order_line_id)
    ),
  ];
  const orphanJobs = orphanPatternJobsToCancel(order, jobs);
  const fabricLineCount = order.fabric_lines.length;
  const activePatternJobCount = activeJobs.length;

  const clickupTaskIds = extractClickUpTaskIds(order.notes, order.id);
  const clickupLineCount = countClickUpGarmentLines(clickupTaskIds);

  const hasMismatch =
    fabricLineCount !== activePatternJobCount || staleLineIds.length > 0;

  return {
    has_mismatch: hasMismatch,
    fabric_line_count: fabricLineCount,
    active_pattern_job_count: activePatternJobCount,
    stale_line_ids: staleLineIds,
    orphan_job_ids: orphanJobs.map((job) => job.id),
    clickup_task_ids: clickupTaskIds,
    clickup_line_count: clickupLineCount,
    imported_from_clickup: clickupTaskIds.length > 0,
  };
}
