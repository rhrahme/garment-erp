import { readPatternJobsAsync } from "@/lib/data/pattern-jobs";
import { readSalesOrdersAsync } from "@/lib/data/sales-orders";
import type {
  PatternAwaitingLinesOrder,
  PatternJob,
  PatternJobRow,
  PatternJobStatus,
  PatternOverview,
  PatternWorkTab,
} from "@/lib/types/pattern";

const ACTIVE_STATUSES: PatternJobStatus[] = [
  "pending",
  "assigned",
  "drafting",
  "awaiting_fitting",
  "revising",
  "ready_for_cutting",
  "blocked",
];

export function jobMatchesTab(status: PatternJobStatus, tab: PatternWorkTab): boolean {
  switch (tab) {
    case "new":
      return status === "pending" || status === "assigned";
    case "drafting":
      return status === "drafting";
    case "in_fittings":
      return status === "awaiting_fitting";
    case "revising":
      return status === "revising";
    case "ready_for_cutting":
      return status === "ready_for_cutting";
    case "blocked":
      return status === "blocked";
    case "completed":
      return status === "completed" || status === "cancelled";
    default:
      return false;
  }
}

export async function listPatternOverview(): Promise<PatternOverview> {
  const [jobsFile, ordersFile] = await Promise.all([readPatternJobsAsync(), readSalesOrdersAsync()]);

  const openOrders = ordersFile.orders.filter(
    (order) => order.status === "open" || order.status === "fabric_pos_created"
  );

  const orderById = new Map(openOrders.map((order) => [order.id, order]));
  const jobsByOrderId = new Map<string, PatternJob[]>();

  for (const job of jobsFile.jobs) {
    if (job.status === "cancelled") continue;
    const list = jobsByOrderId.get(job.sales_order_id) ?? [];
    list.push(job);
    jobsByOrderId.set(job.sales_order_id, list);
  }

  const awaiting_lines_orders: PatternAwaitingLinesOrder[] = openOrders
    .filter((order) => order.fabric_lines.length === 0)
    .map((order) => ({
      sales_order_id: order.id,
      so_number: order.so_number,
      client_id: order.client_id,
      client_name: order.client_name,
      client_code: order.client_code,
      order_date: order.order_date,
      delivery_date: order.delivery_date,
      status: "awaiting_lines" as const,
    }));

  const jobs: PatternJobRow[] = jobsFile.jobs
    .filter((job) => ACTIVE_STATUSES.includes(job.status) || job.status === "completed")
    .map((job) => ({
      job,
      order_delivery_date: orderById.get(job.sales_order_id)?.delivery_date ?? null,
    }))
    .sort((a, b) => {
      if (a.job.trial_priority !== b.job.trial_priority) {
        return a.job.trial_priority ? -1 : 1;
      }
      return (b.job.updated_at ?? "").localeCompare(a.job.updated_at ?? "");
    });

  const by_status = {} as Record<PatternJobStatus, number>;
  for (const status of [
    "pending",
    "assigned",
    "drafting",
    "awaiting_fitting",
    "revising",
    "ready_for_cutting",
    "completed",
    "blocked",
    "cancelled",
  ] as PatternJobStatus[]) {
    by_status[status] = jobsFile.jobs.filter((job) => job.status === status).length;
  }

  return {
    jobs,
    awaiting_lines_orders,
    summary: {
      total_jobs: jobsFile.jobs.filter((job) => job.status !== "cancelled").length,
      by_status,
      awaiting_lines_count: awaiting_lines_orders.length,
    },
  };
}
