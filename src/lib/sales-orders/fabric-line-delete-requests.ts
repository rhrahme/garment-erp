import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSalesOrders, writeSalesOrders } from "@/lib/data/sales-orders";
import { isFabricOrderLineSent } from "@/lib/fabric-sourcing/fabric-order-line-status";
import {
  ensureFabricOrdersLoaded,
  listStoredFabricOrders,
  updateStoredFabricOrdersAsync,
} from "@/lib/integrations/fabric-order-store";
import { notifyIntegration } from "@/lib/integrations";
import { notifyAdminsOfFabricLineDeleteRequest } from "@/lib/integrations/fabric-line-delete-request-alert";
import {
  findFabricPoLineForSoFabricLine,
  getFabricPosForSalesOrder,
} from "@/lib/sales-orders/line-cross-reference";
import { canMutateSalesOrderFabricLine } from "@/lib/sales-orders/fabric-lines-rules";
import {
  buildFabricLineDeleteRequestSummary,
  isFabricLineDeletePending,
  listPendingFabricLineDeleteRequests as listPendingFromOrders,
  type FabricLineDeleteRequestSummary,
} from "@/lib/sales-orders/fabric-line-delete-request-list";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

export type { FabricLineDeleteRequestSummary } from "@/lib/sales-orders/fabric-line-delete-request-list";
export { isFabricLineDeletePending } from "@/lib/sales-orders/fabric-line-delete-request-list";

export function listPendingFabricLineDeleteRequests(
  orders: SalesOrder[] = readSalesOrders().orders,
  allFabricPos = listStoredFabricOrders()
): FabricLineDeleteRequestSummary[] {
  return listPendingFromOrders(orders, allFabricPos);
}

export function countPendingFabricLineDeleteRequests(): number {
  return listPendingFabricLineDeleteRequests().length;
}

function findOrderAndLine(
  orderId: string,
  lineId: string
):
  | { ok: true; storeIndex: number; order: SalesOrder; lineIndex: number; line: SalesOrderFabricLine }
  | { ok: false; status: number; error: string } {
  const store = readSalesOrders();
  const storeIndex = store.orders.findIndex((order) => order.id === orderId);
  if (storeIndex < 0) {
    return { ok: false, status: 404, error: "Sales order not found." };
  }
  const order = store.orders[storeIndex]!;
  const lineIndex = order.fabric_lines.findIndex((line) => line.id === lineId);
  if (lineIndex < 0) {
    return { ok: false, status: 404, error: "Fabric line not found on this order." };
  }
  return {
    ok: true,
    storeIndex,
    order,
    lineIndex,
    line: order.fabric_lines[lineIndex]!,
  };
}

/**
 * QC/sales: request admin delete for a PO-locked fabric line.
 * Mutable (unordered) lines should be removed directly instead.
 * Emails ADMIN_EMAILS + SUPER_ADMIN_EMAILS after persisting the request.
 */
export async function requestFabricLineDelete(
  orderId: string,
  lineId: string,
  actor: string,
  options: { reason?: string | null } = {}
): Promise<
  | { ok: true; order: SalesOrder; line: SalesOrderFabricLine; summary: FabricLineDeleteRequestSummary }
  | { ok: false; status: number; error: string }
> {
  await ensureDocumentsLoaded(["sales_orders", "fabric_orders"]);
  await ensureFabricOrdersLoaded();

  const found = findOrderAndLine(orderId, lineId);
  if (!found.ok) return found;

  const { storeIndex, order, lineIndex, line } = found;
  if (isFabricLineDeletePending(line)) {
    return { ok: false, status: 409, error: "A delete request is already pending for this fabric line." };
  }

  const fabricPos = getFabricPosForSalesOrder(order, listStoredFabricOrders());
  if (canMutateSalesOrderFabricLine(order, line, fabricPos)) {
    return {
      ok: false,
      status: 400,
      error: "This fabric is not on a supplier order - remove it directly instead of requesting delete.",
    };
  }

  const now = new Date().toISOString();
  const reason = options.reason?.trim() || null;
  const updatedLine: SalesOrderFabricLine = {
    ...line,
    delete_requested_at: now,
    delete_requested_by: actor,
    delete_request_reason: reason,
  };

  const store = readSalesOrders();
  const nextLines = order.fabric_lines.map((entry, idx) =>
    idx === lineIndex ? updatedLine : entry
  );
  store.orders[storeIndex] = { ...order, fabric_lines: nextLines };
  const saved = await writeSalesOrders(store);
  const updatedOrder = saved.orders.find((item) => item.id === orderId)!;
  const savedLine = updatedOrder.fabric_lines.find((entry) => entry.id === lineId)!;

  const summary = buildFabricLineDeleteRequestSummary(updatedOrder, savedLine, fabricPos);

  // Same pattern as thread-button photo upload: email all admin addresses.
  await notifyAdminsOfFabricLineDeleteRequest(summary);
  await notifyIntegration("sales_order.fabric_line_delete_requested", {
    order_id: updatedOrder.id,
    so_number: updatedOrder.so_number,
    line_id: savedLine.id,
    fabric_number: savedLine.fabric_number,
    garment_type: savedLine.garment_type,
    requested_by: actor,
    reason,
    po_id: summary.po_id,
    po_number: summary.po_number,
    po_line_emailed: summary.po_line_emailed,
  });

  return { ok: true, order: updatedOrder, line: savedLine, summary };
}

export async function clearFabricLineDeleteRequest(
  orderId: string,
  lineId: string,
  actor: string,
  options: { asReject?: boolean } = {}
): Promise<
  | { ok: true; order: SalesOrder; line: SalesOrderFabricLine }
  | { ok: false; status: number; error: string }
> {
  await ensureDocumentsLoaded(["sales_orders"]);

  const found = findOrderAndLine(orderId, lineId);
  if (!found.ok) return found;

  const { storeIndex, order, lineIndex, line } = found;
  if (!isFabricLineDeletePending(line)) {
    return { ok: true, order, line };
  }

  const cleared: SalesOrderFabricLine = {
    ...line,
    delete_requested_at: null,
    delete_requested_by: null,
    delete_request_reason: null,
  };

  const store = readSalesOrders();
  const nextLines = order.fabric_lines.map((entry, idx) =>
    idx === lineIndex ? cleared : entry
  );
  store.orders[storeIndex] = { ...order, fabric_lines: nextLines };
  const saved = await writeSalesOrders(store);
  const updatedOrder = saved.orders.find((item) => item.id === orderId)!;
  const savedLine = updatedOrder.fabric_lines.find((entry) => entry.id === lineId)!;

  if (options.asReject) {
    await notifyIntegration("sales_order.fabric_line_delete_rejected", {
      order_id: updatedOrder.id,
      so_number: updatedOrder.so_number,
      line_id: savedLine.id,
      fabric_number: savedLine.fabric_number,
      rejected_by: actor,
      requested_by: line.delete_requested_by ?? null,
    });
  }

  return { ok: true, order: updatedOrder, line: savedLine };
}

export type FabricLineDeleteApproveResult = {
  order: SalesOrder;
  removed_line: SalesOrderFabricLine;
  po_id: string | null;
  po_number: string | null;
  po_line_id: string | null;
  po_line_was_emailed: boolean;
  po_line_action: "none" | "cancelled_line" | "removed_line" | "cancelled_po";
  po_cancelled: boolean;
  supplier_follow_up_needed: boolean;
};

/**
 * Admin approve: remove SO fabric line and unlink/cancel the matching PO line.
 *
 * PO behavior:
 * - Matching active PO line is soft-cancelled (cancelled_at) so emailed history remains.
 * - If every non-cancelled line on the PO is gone, the PO is marked cancelled and
 *   removed from the sales order's fabric_po_ids.
 * - If the PO/line was already emailed, supplier_follow_up_needed is true - ERP stops
 *   treating the line as ordered, but the supplier may still ship unless contacted.
 */
export async function approveFabricLineDelete(
  orderId: string,
  lineId: string,
  actor: string
): Promise<
  | { ok: true; result: FabricLineDeleteApproveResult }
  | { ok: false; status: number; error: string }
> {
  await ensureDocumentsLoaded(["sales_orders", "fabric_orders"]);
  await ensureFabricOrdersLoaded();

  const found = findOrderAndLine(orderId, lineId);
  if (!found.ok) return found;

  const { storeIndex, order, line } = found;
  if (!isFabricLineDeletePending(line)) {
    return { ok: false, status: 400, error: "No pending delete request for this fabric line." };
  }

  const fabricPos = getFabricPosForSalesOrder(order, listStoredFabricOrders());
  const match = findFabricPoLineForSoFabricLine(line, fabricPos);

  let poId: string | null = null;
  let poNumber: string | null = null;
  let poLineId: string | null = null;
  let poLineWasEmailed = false;
  let poLineAction: FabricLineDeleteApproveResult["po_line_action"] = "none";
  let poCancelled = false;

  if (match) {
    poId = match.po.id;
    poNumber = match.po.po_number;
    poLineId = match.poLine.id;
    poLineWasEmailed = isFabricOrderLineSent(match.poLine, match.po);
    const cancelledAt = new Date().toISOString();
    const cancelledReason = `Admin approved fabric line delete request (${order.so_number} / ${line.fabric_number}) by ${actor}`;

    await updateStoredFabricOrdersAsync((orders) =>
      orders.map((po) => {
        if (po.id !== match.po.id) return po;
        const nextLines = (po.lines ?? []).map((poLine) =>
          poLine.id === match.poLine.id
            ? {
                ...poLine,
                cancelled_at: cancelledAt,
                cancelled_reason: cancelledReason,
              }
            : poLine
        );
        const hasActiveLines = nextLines.some((poLine) => !poLine.cancelled_at);
        if (!hasActiveLines) {
          poCancelled = true;
          poLineAction = "cancelled_po";
          return { ...po, lines: nextLines, status: "cancelled", total_amount: 0 };
        }
        poLineAction = "cancelled_line";
        const total_amount = nextLines
          .filter((poLine) => !poLine.cancelled_at)
          .reduce((sum, poLine) => sum + poLine.quantity_ordered * poLine.unit_price, 0);
        return { ...po, lines: nextLines, total_amount };
      })
    );

    if (poCancelled) {
      await notifyIntegration("fabric_order.cancelled", {
        id: match.po.id,
        po_number: match.po.po_number,
        supplier_id: match.po.supplier_id,
        supplier_name: match.po.supplier?.name ?? null,
        sales_order_id: order.id,
        reason: "fabric_line_delete_approved",
        batch_size: 1,
      });
    }
  }

  const store = readSalesOrders();
  const current = store.orders[storeIndex]!;
  const removedLine = current.fabric_lines.find((entry) => entry.id === lineId)!;
  const nextLines = current.fabric_lines.filter((entry) => entry.id !== lineId);
  let nextPoIds = current.fabric_po_ids;
  let nextStatus = current.status;

  if (poCancelled && poId) {
    nextPoIds = current.fabric_po_ids.filter((id) => id !== poId);
    const remainingActive = nextPoIds.some((id) => {
      const po = listStoredFabricOrders().find((item) => item.id === id);
      return po && po.status !== "cancelled";
    });
    if (!remainingActive && current.status === "fabric_pos_created") {
      nextStatus = "open";
    }
  }

  store.orders[storeIndex] = {
    ...current,
    fabric_lines: nextLines,
    fabric_po_ids: nextPoIds,
    status: nextStatus,
  };

  const saved = await writeSalesOrders(store);
  const updatedOrder = saved.orders.find((item) => item.id === orderId)!;

  const result: FabricLineDeleteApproveResult = {
    order: updatedOrder,
    removed_line: removedLine,
    po_id: poId,
    po_number: poNumber,
    po_line_id: poLineId,
    po_line_was_emailed: poLineWasEmailed,
    po_line_action: poLineAction,
    po_cancelled: poCancelled,
    supplier_follow_up_needed: poLineWasEmailed,
  };

  await notifyIntegration("sales_order.fabric_line_delete_approved", {
    order_id: updatedOrder.id,
    so_number: updatedOrder.so_number,
    line_id: removedLine.id,
    fabric_number: removedLine.fabric_number,
    garment_type: removedLine.garment_type,
    approved_by: actor,
    requested_by: removedLine.delete_requested_by ?? null,
    reason: removedLine.delete_request_reason ?? null,
    po_id: poId,
    po_number: poNumber,
    po_line_id: poLineId,
    po_line_was_emailed: poLineWasEmailed,
    po_line_action: poLineAction,
    po_cancelled: poCancelled,
    supplier_follow_up_needed: poLineWasEmailed,
  });

  await notifyIntegration("sales_order.fabric_lines_removed", {
    order_id: updatedOrder.id,
    so_number: updatedOrder.so_number,
    line_id: removedLine.id,
    removed_by: actor,
    via: "delete_request_approved",
  });

  return { ok: true, result };
}
