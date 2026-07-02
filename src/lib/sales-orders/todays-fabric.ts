import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { listBespokeSalesOrders, readSalesOrders } from "@/lib/data/sales-orders";
import {
  groupSupplierEmailBatches,
  listSupplierEmailQueue,
} from "@/lib/fabric-sourcing/supplier-email-queue";
import { listStoredFabricOrders } from "@/lib/integrations/fabric-order-store";
import { isFabricOrderPending } from "@/lib/fabric-sourcing/fabric-order-line-status";
import type { PurchaseOrder } from "@/lib/types/fabric-sourcing";
import type { SalesOrder, SalesOrderStatus } from "@/lib/types/sales-orders";

export type TodaysFabricOrderRow = {
  id: string;
  so_number: string;
  client_name: string;
  client_code: string;
  fabric_line_count: number;
  status: SalesOrderStatus;
  has_pos: boolean;
  supplier_emails_pending: boolean;
  missing_delivery_destination: boolean;
  needs_replacement: boolean;
  replacement_fabrics: string[];
  order_date: string;
  can_create_pos: boolean;
  block_reason: string | null;
};

export type TodaysFabricSummary = {
  orders: TodaysFabricOrderRow[];
  date_scope: "today" | "last_7_days";
  order_count: number;
  pending_supplier_count: number;
};

function todayIso(referenceDate = new Date()): string {
  return referenceDate.toISOString().slice(0, 10);
}

function last7DaysCutoff(referenceDate = new Date()): string {
  const cutoff = new Date(referenceDate);
  cutoff.setDate(cutoff.getDate() - 7);
  return cutoff.toISOString().slice(0, 10);
}

export function getFabricPosBlockReason(order: SalesOrder): string | null {
  if (order.status !== "open") {
    return order.fabric_po_ids.length > 0 ? "POs already exist" : "Order is not open";
  }
  if (order.fabric_lines.length === 0) {
    return "No fabric lines";
  }
  if (!order.delivery_destination) {
    return "Set ship destination first";
  }
  if (order.fabric_po_ids.length > 0) {
    return "POs already exist";
  }
  const pendingReplacements = order.fabric_lines.filter((line) => line.needs_replacement);
  if (pendingReplacements.length > 0) {
    return `Pick replacements for ${pendingReplacements.map((line) => line.fabric_number).join(", ")}`;
  }
  return null;
}

function orderHasPendingSupplierEmails(
  order: SalesOrder,
  fabricOrdersBySalesOrderId: Map<string, PurchaseOrder[]>
): boolean {
  const pos = fabricOrdersBySalesOrderId.get(order.id) ?? [];
  if (pos.length === 0) return false;
  return pos.some((po) => isFabricOrderPending(po));
}

function orderNeedsFabricAction(
  order: SalesOrder,
  fabricOrdersBySalesOrderId: Map<string, PurchaseOrder[]>
): boolean {
  if (order.fabric_lines.length === 0 || order.status === "complete") {
    return false;
  }
  if (order.status === "open") {
    return true;
  }
  if (order.status === "fabric_pos_created") {
    return orderHasPendingSupplierEmails(order, fabricOrdersBySalesOrderId);
  }
  return false;
}

function buildFabricOrdersBySalesOrderId() {
  const map = new Map<string, PurchaseOrder[]>();
  for (const po of listStoredFabricOrders()) {
    if (!po.sales_order_id) continue;
    const bucket = map.get(po.sales_order_id) ?? [];
    bucket.push(po);
    map.set(po.sales_order_id, bucket);
  }
  return map;
}

function toRow(
  order: SalesOrder,
  fabricOrdersBySalesOrderId: Map<string, PurchaseOrder[]>
): TodaysFabricOrderRow {
  const blockReason = getFabricPosBlockReason(order);
  const replacementFabrics = order.fabric_lines
    .filter((line) => line.needs_replacement)
    .map((line) => line.fabric_number);

  return {
    id: order.id,
    so_number: order.so_number,
    client_name: order.client_name,
    client_code: order.client_code,
    fabric_line_count: order.fabric_lines.length,
    status: order.status,
    has_pos: order.fabric_po_ids.length > 0,
    supplier_emails_pending: orderHasPendingSupplierEmails(order, fabricOrdersBySalesOrderId),
    missing_delivery_destination: !order.delivery_destination,
    needs_replacement: replacementFabrics.length > 0,
    replacement_fabrics: replacementFabrics,
    order_date: order.order_date,
    can_create_pos: order.status === "open" && blockReason === null,
    block_reason: blockReason,
  };
}

function filterOrdersByDateScope(
  orders: SalesOrder[],
  referenceDate = new Date()
): { orders: SalesOrder[]; date_scope: TodaysFabricSummary["date_scope"] } {
  const today = todayIso(referenceDate);
  const todayOrders = orders.filter((order) => order.order_date === today);
  if (todayOrders.length > 0) {
    return { orders: todayOrders, date_scope: "today" };
  }

  const cutoff = last7DaysCutoff(referenceDate);
  return {
    orders: orders.filter((order) => order.order_date >= cutoff),
    date_scope: "last_7_days",
  };
}

async function countPendingSuppliersForOrderIds(orderIds: string[]): Promise<number> {
  if (orderIds.length === 0) return 0;
  const orderIdSet = new Set(orderIds);
  const queue = await listSupplierEmailQueue();
  const pending = queue.filter(
    (item) => item.sales_order_id && orderIdSet.has(item.sales_order_id) && isFabricOrderPending(item)
  );
  return groupSupplierEmailBatches(pending, { consolidate: true }).filter((batch) => batch.is_pending).length;
}

export async function getTodaysFabricSummary(referenceDate = new Date()): Promise<TodaysFabricSummary> {
  await ensureDocumentsLoaded(["sales_orders", "fabric_orders"]);

  const fabricOrdersBySalesOrderId = buildFabricOrdersBySalesOrderId();
  const candidates = listBespokeSalesOrders(readSalesOrders().orders).filter((order) =>
    orderNeedsFabricAction(order, fabricOrdersBySalesOrderId)
  );

  const { orders: scopedOrders, date_scope } = filterOrdersByDateScope(candidates, referenceDate);
  const rows = scopedOrders
    .map((order) => toRow(order, fabricOrdersBySalesOrderId))
    .sort((a, b) => b.order_date.localeCompare(a.order_date) || a.so_number.localeCompare(b.so_number));

  const pending_supplier_count = await countPendingSuppliersForOrderIds(rows.map((row) => row.id));

  return {
    orders: rows,
    date_scope,
    order_count: rows.length,
    pending_supplier_count,
  };
}

export async function countAllPendingSupplierBatches(): Promise<number> {
  const batches = await listSupplierEmailQueue().then((queue) =>
    groupSupplierEmailBatches(
      queue.filter((item) => isFabricOrderPending(item)),
      { consolidate: true }
    )
  );
  return batches.filter((batch) => batch.is_pending).length;
}
