import { readSalesOrdersFresh } from "@/lib/data/sales-orders";
import {
  resolveMarkerFabricWidthDetails,
  type MarkerFabricWidthSource,
} from "@/lib/pattern-library/marker-layout";
import type { ClientPattern } from "@/lib/types/pattern-library";

/** Server-only: loads sales orders when linked lines exist. */
export async function resolveMarkerFabricWidthAsync(
  pattern: ClientPattern,
  options: { hints?: Array<number | null | undefined> } = {}
): Promise<{ width_cm: number; source: MarkerFabricWidthSource } | null> {
  const sync = resolveMarkerFabricWidthDetails(pattern, { hints: options.hints });
  if (sync) return sync;
  if (!(pattern.linked_fabric_line_ids?.length)) return null;
  const store = await readSalesOrdersFresh();
  return resolveMarkerFabricWidthDetails(pattern, {
    hints: options.hints,
    salesOrders: store.orders,
  });
}
