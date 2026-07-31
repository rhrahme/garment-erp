import { readPatternJobsFresh, writePatternJobs } from "@/lib/data/pattern-jobs";
import { orphanPatternJobsToCancel } from "@/lib/sales-orders/pattern-so-mismatch";
import { fabricLineArticleNumber, piecesForFabricLine } from "@/lib/sales-orders/label-codes";
import { generateTudPatternCode } from "@/lib/pattern/tud-pattern-code";
import type { PatternJob } from "@/lib/types/pattern";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";
import { notifyIntegration } from "@/lib/integrations";

function jobFieldsFromLine(
  order: SalesOrder,
  line: SalesOrderFabricLine,
  articleNumber: number
): Omit<PatternJob, "id" | "status" | "assigned_to" | "pattern_code" | "pattern_size_notes" | "trial_priority" | "blocked_reason" | "notes" | "fittings" | "revisions" | "created_at" | "updated_at"> {
  const pieceNames = piecesForFabricLine(line);
  return {
    sales_order_id: order.id,
    sales_order_line_id: line.id,
    so_number: order.so_number,
    client_id: order.client_id,
    client_name: order.client_name,
    client_code: order.client_code,
    garment_type: line.garment_type,
    piece_name: pieceNames[0] ?? line.garment_type,
    piece_names: pieceNames,
    article_number: articleNumber,
    fabric_number: line.fabric_number,
    supplier: line.supplier_name,
    supplier_id: line.supplier_id,
    composition: line.composition,
    gsm: line.weight_gsm,
    width_cm: line.width_cm,
    width_inches: line.width_inches,
    color: line.color,
    meters: line.quantity,
  };
}

export type PatternSyncResult = {
  created: string[];
  updated: string[];
  cancelled: string[];
  /** Orphan jobs that were not cancelled because forceCancelOrphans was false. */
  skipped_cancellations: string[];
};

export async function syncPatternJobsFromSalesOrder(
  order: SalesOrder,
  options: { notify?: boolean; forceCancelOrphans?: boolean } = {}
): Promise<PatternSyncResult> {
  const store = await readPatternJobsFresh();
  const now = new Date().toISOString();
  const created: string[] = [];
  const updated: string[] = [];
  const cancelled: string[] = [];
  const skipped_cancellations: string[] = [];

  const existingForOrder = store.jobs.filter((job) => job.sales_order_id === order.id);
  const lineIds = new Set(order.fabric_lines.map((line) => line.id));
  const orphansToCancel = orphanPatternJobsToCancel(order, store.jobs);

  for (const [index, line] of order.fabric_lines.entries()) {
    const articleNumber = fabricLineArticleNumber(index);
    const fields = jobFieldsFromLine(order, line, articleNumber);
    const existing = existingForOrder.find((job) => job.sales_order_line_id === line.id);

    if (existing) {
      const wasCancelled = existing.status === "cancelled";
      const nextStatus =
        wasCancelled && lineIds.has(line.id) ? "pending" : existing.status === "cancelled" ? "cancelled" : existing.status;

      const nextJob: PatternJob = {
        ...existing,
        ...fields,
        status: nextStatus,
        updated_at: now,
      };

      const piecesChanged =
        JSON.stringify(existing.piece_names ?? []) !== JSON.stringify(nextJob.piece_names ?? []);
      const changed =
        existing.fabric_number !== nextJob.fabric_number ||
        existing.garment_type !== nextJob.garment_type ||
        existing.piece_name !== nextJob.piece_name ||
        piecesChanged ||
        existing.meters !== nextJob.meters ||
        existing.supplier !== nextJob.supplier ||
        existing.supplier_id !== nextJob.supplier_id ||
        wasCancelled;

      if (changed) {
        updated.push(existing.id);
      }

      const jobIndex = store.jobs.findIndex((job) => job.id === existing.id);
      if (jobIndex >= 0) store.jobs[jobIndex] = nextJob;
    } else {
      const id = `pj-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
      const job: PatternJob = {
        id,
        ...fields,
        status: "pending",
        assigned_to: null,
        pattern_code: generateTudPatternCode(fields),
        pattern_size_notes: null,
        trial_priority: false,
        blocked_reason: null,
        notes: null,
        fittings: [],
        revisions: [],
        created_at: now,
        updated_at: now,
      };
      store.jobs.unshift(job);
      created.push(id);

      if (options.notify) {
        await notifyIntegration("pattern_job.created", {
          id: job.id,
          sales_order_id: order.id,
          so_number: order.so_number,
          sales_order_line_id: line.id,
          garment_type: line.garment_type,
        });
      }
    }
  }

  if (orphansToCancel.length > 0 && !options.forceCancelOrphans) {
    skipped_cancellations.push(...orphansToCancel.map((job) => job.id));
  } else {
    for (const job of orphansToCancel) {
      const jobIndex = store.jobs.findIndex((item) => item.id === job.id);
      if (jobIndex < 0) continue;

      store.jobs[jobIndex] = {
        ...store.jobs[jobIndex]!,
        status: "cancelled",
        updated_at: now,
      };
      cancelled.push(job.id);
    }
  }

  await writePatternJobs(store);

  return { created, updated, cancelled, skipped_cancellations };
}
