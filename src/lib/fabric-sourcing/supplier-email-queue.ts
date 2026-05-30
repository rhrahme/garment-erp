import { readSalesOrders } from "@/lib/data/sales-orders";
import { listStoredFabricOrders } from "@/lib/integrations/fabric-order-store";
import type { DeliveryDestination } from "@/lib/shipping/delivery-destinations";
import type { PurchaseOrder } from "@/lib/types/fabric-sourcing";

export type SupplierEmailQueueItem = PurchaseOrder & {
  so_number: string | null;
  client_code: string | null;
  delivery_destination: DeliveryDestination | null;
};

export function listSupplierEmailQueue(salesOrderId?: string | null): SupplierEmailQueueItem[] {
  const salesById = new Map(readSalesOrders().orders.map((order) => [order.id, order]));

  return listStoredFabricOrders()
    .filter((order) => !salesOrderId || order.sales_order_id === salesOrderId)
    .map((order) => {
      const salesOrder = order.sales_order_id ? salesById.get(order.sales_order_id) : undefined;
      return {
        ...order,
        so_number: salesOrder?.so_number ?? null,
        client_code: salesOrder?.client_code ?? null,
        delivery_destination: salesOrder?.delivery_destination ?? null,
      };
    })
    .sort((a, b) => {
      const aPending = a.emailed_at ? 1 : 0;
      const bPending = b.emailed_at ? 1 : 0;
      if (aPending !== bPending) return aPending - bPending;
      return b.order_date.localeCompare(a.order_date) * -1;
    });
}
