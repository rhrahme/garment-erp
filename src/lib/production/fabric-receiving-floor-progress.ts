import type {
  FabricLineReceiveStatus,
  FabricReceivingLineRow,
  FabricReceivingOrderRow,
} from "@/lib/types/fabric-receipts";
import type { FabricPrepStep } from "@/lib/types/production";

/** Honest floor-progress buckets mapped from receive / prep / handoff. */
export type FloorProgressBucket =
  | "pending"
  | "received"
  | "washing"
  | "soaking"
  | "drying"
  | "ironing"
  | "done";

export type FloorProgressCounts = {
  total: number;
  pending: number;
  received: number;
  washing: number;
  soaking: number;
  drying: number;
  ironing: number;
  done: number;
};

export function floorProgressBucketForLine(
  status: FabricLineReceiveStatus,
  prepStep: FabricPrepStep | null | undefined
): FloorProgressBucket {
  if (status === "pending") return "pending";
  if (status === "received") return "received";
  if (status === "handed_off") return "done";
  if (status === "fabric_prep") {
    if (prepStep === "wash") return "washing";
    if (prepStep === "soak") return "soaking";
    if (prepStep === "drying") return "drying";
    return "ironing";
  }
  return "pending";
}

export function lineHasFloorProgressScan(line: Pick<FabricReceivingLineRow, "status">): boolean {
  return line.status !== "pending";
}

/** Orders with at least one receive / wash / soak / iron / handoff scan. */
export function orderHasFloorProgress(
  order: Pick<FabricReceivingOrderRow, "lines">
): boolean {
  return order.lines.some(lineHasFloorProgressScan);
}

export function countFloorProgress(lines: FabricReceivingLineRow[]): FloorProgressCounts {
  const counts: FloorProgressCounts = {
    total: lines.length,
    pending: 0,
    received: 0,
    washing: 0,
    soaking: 0,
    drying: 0,
    ironing: 0,
    done: 0,
  };

  for (const line of lines) {
    const bucket = floorProgressBucketForLine(line.status, line.fabric_prep_step);
    counts[bucket] += 1;
  }

  return counts;
}

/**
 * Client/order summary, e.g. `10 fabrics · 1 received · 0 washing · 0 ironing · 0 done`.
 * Includes soaking only when that step is in play (count > 0).
 */
export function formatFloorProgressSummary(counts: FloorProgressCounts): string {
  const parts = [
    `${counts.total} fabric${counts.total === 1 ? "" : "s"}`,
    `${counts.received} received`,
    `${counts.washing} washing`,
  ];
  if (counts.soaking > 0) {
    parts.push(`${counts.soaking} soaking`);
  }
  if (counts.drying > 0) {
    parts.push(`${counts.drying} drying`);
  }
  parts.push(`${counts.ironing} ironing`);
  parts.push(`${counts.done} done`);
  return parts.join(" · ");
}

/** Keep only orders that have started floor work; preserve all sibling lines. */
export function filterOrdersWithFloorProgress(
  orders: FabricReceivingOrderRow[]
): FabricReceivingOrderRow[] {
  return orders.filter(orderHasFloorProgress);
}
