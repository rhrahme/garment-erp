import type { GarmentTypeChange } from "@/lib/types/garment-type-changes";

export type GarmentTypeChangeFlag = {
  change_id: string;
  sales_order_line_id: string;
  from_garment_type: string;
  to_garment_type: string;
  changed_at: string;
  changed_by: string;
  acknowledged: boolean;
};

export function isGarmentTypeChangeAcknowledged(change: GarmentTypeChange): boolean {
  return change.acknowledged_at != null;
}

export function buildGarmentTypeChangeFlagsByLineId(
  changes: GarmentTypeChange[],
  salesOrderId?: string
): Record<string, GarmentTypeChangeFlag> {
  const filtered = salesOrderId
    ? changes.filter((change) => change.sales_order_id === salesOrderId)
    : changes;

  const latestByLine = new Map<string, GarmentTypeChange>();
  for (const change of filtered) {
    const existing = latestByLine.get(change.sales_order_line_id);
    if (!existing || change.changed_at > existing.changed_at) {
      latestByLine.set(change.sales_order_line_id, change);
    }
  }

  return Object.fromEntries(
    [...latestByLine.entries()].map(([lineId, change]) => [
      lineId,
      {
        change_id: change.id,
        sales_order_line_id: change.sales_order_line_id,
        from_garment_type: change.from_garment_type,
        to_garment_type: change.to_garment_type,
        changed_at: change.changed_at,
        changed_by: change.changed_by,
        acknowledged: isGarmentTypeChangeAcknowledged(change),
      },
    ])
  );
}

export function countUnacknowledgedGarmentTypeChanges(changes: GarmentTypeChange[]): number {
  return changes.filter((change) => !isGarmentTypeChangeAcknowledged(change)).length;
}
