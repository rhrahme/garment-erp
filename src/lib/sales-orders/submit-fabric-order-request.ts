import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSalesOrders, writeSalesOrders } from "@/lib/data/sales-orders";
import type { SalesOrder } from "@/lib/types/sales-orders";

export async function submitFabricOrderRequest(
  orderId: string,
  options: { requestedBy?: string | null } = {}
): Promise<
  | { ok: true; order: SalesOrder }
  | { ok: false; status: number; error: string }
> {
  await ensureDocumentsLoaded(["sales_orders"]);

  const store = readSalesOrders();
  const index = store.orders.findIndex((order) => order.id === orderId);
  if (index < 0) {
    return { ok: false, status: 404, error: "Sales order not found." };
  }

  const order = store.orders[index]!;

  if (order.status !== "open") {
    return { ok: false, status: 409, error: "Only open orders can be submitted for fabric ordering." };
  }
  if (order.fabric_lines.length === 0) {
    return { ok: false, status: 400, error: "Add at least one fabric line before submitting." };
  }
  if (!order.delivery_destination) {
    return { ok: false, status: 400, error: "Select a fabric delivery destination before submitting." };
  }
  if (order.fabric_po_ids.length > 0) {
    return { ok: false, status: 409, error: "Supplier fabric orders were already created for this order." };
  }

  const pendingReplacements = order.fabric_lines.filter((line) => line.needs_replacement);
  if (pendingReplacements.length > 0) {
    return {
      ok: false,
      status: 409,
      error: `Pick replacements for ${pendingReplacements.map((line) => line.fabric_number).join(", ")} before submitting.`,
    };
  }

  const requestedAt = new Date().toISOString();
  store.orders[index] = {
    ...order,
    fabric_order_requested_at: requestedAt,
    fabric_order_requested_by: options.requestedBy?.trim() || null,
  };

  const saved = await writeSalesOrders(store);
  const updated = saved.orders.find((item) => item.id === orderId)!;

  return { ok: true, order: updated };
}
