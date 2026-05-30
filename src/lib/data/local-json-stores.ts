import { readProductionWorkOrders } from "@/lib/data/production-work-orders";
import { readSalesOrders } from "@/lib/data/sales-orders";
import { listStoredFabricOrders } from "@/lib/integrations/fabric-order-store";
import { listStoredShipments } from "@/lib/integrations/shipment-store";
import type {
  DashboardStats,
  PurchaseOrder,
  SalesOrder,
  Shipment,
  WorkOrder,
} from "@/lib/types/database";

const CLOSED_SALES_ORDER_STATUSES = new Set(["delivered", "cancelled", "complete"]);
const INACTIVE_WORK_ORDER_STATUSES = new Set(["completed", "on_hold"]);

export function getLocalSalesOrders(): SalesOrder[] {
  return readSalesOrders().orders.map((order) => ({
    id: order.id,
    so_number: order.so_number,
    customer_id: order.client_id,
    status: order.status,
    order_date: order.order_date,
    delivery_date: order.delivery_date,
    total_amount: order.fabric_lines.reduce(
      (sum, line) => sum + line.quantity * (line.unit_price ?? 0),
      0
    ),
    customer: {
      id: order.client_id,
      code: order.client_code,
      name: order.client_name,
      country: null,
    },
  }));
}

export function getLocalWorkOrders(): WorkOrder[] {
  return [...readProductionWorkOrders().work_orders]
    .sort((a, b) => {
      const aDone = a.status === "completed" ? 1 : 0;
      const bDone = b.status === "completed" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return b.updated_at.localeCompare(a.updated_at);
    })
    .map((order) => ({
      id: order.id,
      wo_number: order.sticker_code,
      style_id: order.sales_order_line_id,
      status: order.status,
      quantity_planned: order.fabric_meters,
      quantity_completed: order.status === "completed" ? order.fabric_meters : 0,
      start_date: order.received_at.slice(0, 10),
      due_date: null,
      style: {
        id: order.sales_order_line_id,
        style_code: order.so_number,
        name: [order.client_name, order.garment_type, order.piece_name].filter(Boolean).join(" — "),
        season: null,
        category: order.garment_type,
        target_cost: null,
        selling_price: null,
        is_active: true,
      },
    }));
}

export function getLocalShipments(): Shipment[] {
  return listStoredShipments().map((shipment) => ({
    id: shipment.id,
    awb_number: shipment.awb_number,
    carrier: shipment.carrier,
    direction: shipment.direction,
    status: shipment.status,
    origin: shipment.current_location ?? null,
    destination: shipment.direction === "inbound" ? "Factory" : null,
    estimated_arrival: shipment.estimated_arrival,
    delivered_at: shipment.delivered_at,
  }));
}

export function getLocalPurchaseOrders(): PurchaseOrder[] {
  return listStoredFabricOrders().map((order) => ({
    id: order.id,
    po_number: order.po_number,
    supplier_id: order.supplier_id,
    status: order.status,
    order_date: order.order_date,
    expected_date: order.expected_date,
    total_amount: order.total_amount,
    client_reference: order.client_reference,
    emailed_at: order.emailed_at,
    email_to: order.email_to,
    expected_carrier: order.expected_carrier,
    supplier: order.supplier,
  }));
}

export function getLocalDashboardStats(): DashboardStats {
  const { orders } = readSalesOrders();
  const { work_orders } = readProductionWorkOrders();
  const shipments = listStoredShipments();

  return {
    openSalesOrders: orders.filter((order) => !CLOSED_SALES_ORDER_STATUSES.has(order.status)).length,
    activeWorkOrders: work_orders.filter((order) => !INACTIVE_WORK_ORDER_STATUSES.has(order.status)).length,
    lowStockItems: 0,
    inboundShipments: shipments.filter(
      (shipment) => shipment.direction === "inbound" && shipment.status === "in_transit"
    ).length,
    pendingInspections: 0,
    totalEmployees: 0,
  };
}
