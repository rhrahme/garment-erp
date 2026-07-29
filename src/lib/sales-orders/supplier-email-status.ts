import {
  isFabricOrderFullySent,
  isFabricOrderLineSent,
} from "@/lib/fabric-sourcing/fabric-order-line-status";
import {
  buildSoFabricLineEmailStatus,
  getFabricPosForSalesOrder,
  summarizeSoFabricLineEmailStatus,
} from "@/lib/sales-orders/line-cross-reference";
import type { PurchaseOrder } from "@/lib/types/fabric-sourcing";
import type { SalesOrder } from "@/lib/types/sales-orders";

/** Order-level supplier-email visibility for lists and headers (view-only for all roles). */
export type SupplierEmailOrderStatus = "none" | "pending" | "partial" | "sent";

export type SupplierEmailOrderSummary = {
  status: SupplierEmailOrderStatus;
  sent: number;
  pending: number;
  unmatched: number;
  /** True when at least one linked PO exists. */
  has_fabric_orders: boolean;
};

export function summarizeSalesOrderSupplierEmail(
  order: Pick<SalesOrder, "id" | "so_number" | "fabric_po_ids" | "fabric_lines">,
  fabricPos: PurchaseOrder[]
): SupplierEmailOrderSummary {
  const linkedPos = getFabricPosForSalesOrder(order, fabricPos);
  if (linkedPos.length === 0) {
    return {
      status: "none",
      sent: 0,
      pending: 0,
      unmatched: 0,
      has_fabric_orders: false,
    };
  }

  const counts = summarizeSoFabricLineEmailStatus(order.fabric_lines, linkedPos);
  const tracked = counts.sent + counts.pending;

  let status: SupplierEmailOrderStatus = "pending";
  if (tracked === 0 && counts.unmatched > 0) {
    status = "pending";
  } else if (counts.pending === 0 && counts.sent > 0) {
    status = "sent";
  } else if (counts.sent > 0 && counts.pending > 0) {
    status = "partial";
  } else if (counts.pending > 0) {
    status = "pending";
  } else if (linkedPos.every((po) => isFabricOrderFullySent(po))) {
    status = "sent";
  }

  return {
    status,
    sent: counts.sent,
    pending: counts.pending,
    unmatched: counts.unmatched,
    has_fabric_orders: true,
  };
}

export function summarizePurchaseOrderSupplierEmail(order: PurchaseOrder): SupplierEmailOrderSummary {
  const lines = order.lines ?? [];
  if (lines.length === 0) {
    const sent = Boolean(order.emailed_at);
    return {
      status: sent ? "sent" : "none",
      sent: sent ? 1 : 0,
      pending: sent ? 0 : 0,
      unmatched: 0,
      has_fabric_orders: true,
    };
  }

  let sent = 0;
  let pending = 0;
  for (const line of lines) {
    if (isFabricOrderLineSent(line, order)) sent += 1;
    else pending += 1;
  }

  const status: SupplierEmailOrderStatus =
    pending === 0 && sent > 0 ? "sent" : sent > 0 && pending > 0 ? "partial" : "pending";

  return {
    status,
    sent,
    pending,
    unmatched: 0,
    has_fabric_orders: true,
  };
}

export function supplierEmailStatusLabel(status: SupplierEmailOrderStatus): string {
  switch (status) {
    case "sent":
      return "Email sent";
    case "partial":
      return "Email partial";
    case "pending":
      return "Email pending";
    default:
      return "No fabric order";
  }
}

/** Compact badge copy for list rows. */
export function supplierEmailStatusShortLabel(
  summary: Pick<SupplierEmailOrderSummary, "status" | "sent" | "pending">
): string {
  if (summary.status === "sent") return "Email sent";
  if (summary.status === "partial") {
    return `Email ${summary.sent}/${summary.sent + summary.pending}`;
  }
  if (summary.status === "pending") return "Email pending";
  return "—";
}

export { buildSoFabricLineEmailStatus, summarizeSoFabricLineEmailStatus };
