import { readPatternJobsFresh, writePatternJobs } from "@/lib/data/pattern-jobs";
import { fabricLineArticleNumber, getGarmentPieces } from "@/lib/sales-orders/label-codes";
import type { PatternJob } from "@/lib/types/pattern";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";
import { notifyIntegration } from "@/lib/integrations";

function pieceNameForLine(line: SalesOrderFabricLine): string {
  const sticker = line.label_stickers?.[0];
  if (sticker?.piece_name) return sticker.piece_name;
  const pieces = getGarmentPieces(line.garment_type);
  return pieces[0] ?? line.garment_type;
}

function jobFieldsFromLine(
  order: SalesOrder,
  line: SalesOrderFabricLine,
  articleNumber: number
): Omit<PatternJob, "id" | "status" | "assigned_to" | "pattern_code" | "pattern_size_notes" | "trial_priority" | "blocked_reason" | "notes" | "fittings" | "revisions" | "created_at" | "updated_at"> {
  return {
    sales_order_id: order.id,
    sales_order_line_id: line.id,
    so_number: order.so_number,
    client_id: order.client_id,
    client_name: order.client_name,
    client_code: order.client_code,
    garment_type: line.garment_type,
    piece_name: pieceNameForLine(line),
    article_number: articleNumber,
    fabric_number: line.fabric_number,
    supplier: line.supplier_name,
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
};

export async function syncPatternJobsFromSalesOrder(
  order: SalesOrder,
  options: { notify?: boolean } = {}
): Promise<PatternSyncResult> {
  const store = await readPatternJobsFresh();
  const now = new Date().toISOString();
  const created: string[] = [];
  const updated: string[] = [];
  const cancelled: string[] = [];

  const existingForOrder = store.jobs.filter((job) => job.sales_order_id === order.id);
  const lineIds = new Set(order.fabric_lines.map((line) => line.id));

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

      const changed =
        existing.fabric_number !== nextJob.fabric_number ||
        existing.garment_type !== nextJob.garment_type ||
        existing.meters !== nextJob.meters ||
        existing.supplier !== nextJob.supplier ||
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
        pattern_code: null,
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

  for (const job of existingForOrder) {
    if (lineIds.has(job.sales_order_line_id)) continue;
    if (job.status === "cancelled" || job.status === "completed") continue;

    const jobIndex = store.jobs.findIndex((item) => item.id === job.id);
    if (jobIndex < 0) continue;

    store.jobs[jobIndex] = {
      ...store.jobs[jobIndex]!,
      status: "cancelled",
      updated_at: now,
    };
    cancelled.push(job.id);
  }

  await writePatternJobs(store);

  return { created, updated, cancelled };
}
