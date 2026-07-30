import {
  formatGarmentWithPieceList,
  piecesForPatternJob,
} from "@/lib/sales-orders/label-codes";
import type { PatternJobRow } from "@/lib/types/pattern";

export type PatternQueueGroup = {
  sales_order_id: string;
  so_number: string;
  client_id: string;
  client_name: string;
  client_code: string;
  /** House / factory brand label when available on the job row. */
  house_brand: string | null;
  order_delivery_date: string | null;
  job_count: number;
  fabric_line_count: number;
  /** Parent garment labels with pieces, e.g. Suit (Jacket + Trouser). */
  garment_types: string[];
  status_summary: string[];
  has_trial_priority: boolean;
  linked_pattern_count: number;
  unlinked_job_count: number;
  jobs: PatternJobRow[];
};

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

/**
 * Collapse pattern job rows into one summary group per sales order so the
 * Pattern queue can show client+SO cards instead of one card per fabric line.
 */
export function groupPatternJobsBySalesOrder(rows: PatternJobRow[]): PatternQueueGroup[] {
  const byOrder = new Map<string, PatternJobRow[]>();

  for (const row of rows) {
    const key = row.job.sales_order_id;
    const list = byOrder.get(key);
    if (list) list.push(row);
    else byOrder.set(key, [row]);
  }

  const groups: PatternQueueGroup[] = [];

  for (const [sales_order_id, jobRows] of byOrder) {
    const sorted = [...jobRows].sort((a, b) => {
      if (a.job.trial_priority !== b.job.trial_priority) {
        return a.job.trial_priority ? -1 : 1;
      }
      return a.job.article_number - b.job.article_number;
    });

    const first = sorted[0]!.job;
    const linked_pattern_count = sorted.filter((row) => Boolean(row.job.client_pattern_id)).length;
    const house_brand =
      sorted.find((row) => row.house_brand)?.house_brand ??
      null;

    groups.push({
      sales_order_id,
      so_number: first.so_number,
      client_id: first.client_id,
      client_name: first.client_name,
      client_code: first.client_code,
      house_brand,
      order_delivery_date: sorted.find((row) => row.order_delivery_date)?.order_delivery_date ?? null,
      job_count: sorted.length,
      fabric_line_count: sorted.length,
      garment_types: uniqueSorted(
        sorted.map((row) =>
          formatGarmentWithPieceList(row.job.garment_type, piecesForPatternJob(row.job))
        )
      ),
      status_summary: uniqueSorted(sorted.map((row) => row.job.status)),
      has_trial_priority: sorted.some((row) => row.job.trial_priority),
      linked_pattern_count,
      unlinked_job_count: sorted.length - linked_pattern_count,
      jobs: sorted,
    });
  }

  return groups.sort((a, b) => {
    if (a.has_trial_priority !== b.has_trial_priority) {
      return a.has_trial_priority ? -1 : 1;
    }
    const aUpdated = a.jobs[0]?.job.updated_at ?? "";
    const bUpdated = b.jobs[0]?.job.updated_at ?? "";
    return bUpdated.localeCompare(aUpdated);
  });
}
