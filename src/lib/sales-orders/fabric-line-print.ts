import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { notifyIntegration } from "@/lib/integrations";
import { readSalesOrders, writeSalesOrders } from "@/lib/data/sales-orders";
import {
  markFabricLinesPrinted,
  resolvePrintLineIds,
  type FabricLinePrintKind,
} from "@/lib/sales-orders/fabric-lines";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

const VALID_PRINT_KINDS: FabricLinePrintKind[] = ["a4", "prep_stickers", "prod_stickers"];

export function isFabricLinePrintKind(value: unknown): value is FabricLinePrintKind {
  return typeof value === "string" && VALID_PRINT_KINDS.includes(value as FabricLinePrintKind);
}

export async function markSalesOrderFabricLinesPrinted(
  orderId: string,
  kind: FabricLinePrintKind,
  lineIds?: string[]
): Promise<
  | { ok: true; order: SalesOrder; marked_line_ids: string[]; fabric_lines: SalesOrderFabricLine[] }
  | { ok: false; status: number; error: string }
> {
  await ensureDocumentsLoaded(["sales_orders"]);

  const store = readSalesOrders();
  const index = store.orders.findIndex((order) => order.id === orderId);
  if (index < 0) {
    return { ok: false, status: 404, error: "Sales order not found." };
  }

  const order = store.orders[index]!;
  const ids = resolvePrintLineIds(order, kind, lineIds);
  if (ids.length === 0) {
    return { ok: false, status: 400, error: "No unprinted fabric lines for this print type." };
  }

  const printedAt = new Date().toISOString();
  const fabric_lines = markFabricLinesPrinted(order.fabric_lines, ids, kind, printedAt);
  store.orders[index] = { ...order, fabric_lines };

  const saved = await writeSalesOrders(store);
  const updated = saved.orders.find((item) => item.id === orderId)!;

  await notifyIntegration("sales_order.fabric_lines_printed", {
    order_id: orderId,
    so_number: updated.so_number,
    kind,
    marked_line_ids: ids,
    marked_count: ids.length,
  });

  return { ok: true, order: updated, marked_line_ids: ids, fabric_lines };
}
