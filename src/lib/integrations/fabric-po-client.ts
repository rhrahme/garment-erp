import { getSalesOrderById } from "@/lib/data/sales-orders";
import { getStoredFabricOrder, listStoredFabricOrders } from "@/lib/integrations/fabric-order-store";

/** Resolve sales-order client name from a fabric PO id or number. */
export function resolveClientNameForFabricPo(input: {
  purchase_order_id?: string | null;
  po_number?: string | null;
}): string | null {
  const po = input.purchase_order_id
    ? getStoredFabricOrder(input.purchase_order_id)
    : input.po_number
      ? listStoredFabricOrders().find(
          (order) => order.po_number.toUpperCase() === input.po_number!.trim().toUpperCase()
        )
      : undefined;

  if (!po?.sales_order_id) return null;
  return getSalesOrderById(po.sales_order_id)?.client_name ?? null;
}
