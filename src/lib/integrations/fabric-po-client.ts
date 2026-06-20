import { findSalesOrderByFabricPoId, getSalesOrderById } from "@/lib/data/sales-orders";
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

  const salesOrder =
    (po?.sales_order_id ? getSalesOrderById(po.sales_order_id) : undefined) ??
    (input.purchase_order_id ? findSalesOrderByFabricPoId(input.purchase_order_id) : undefined);
  return salesOrder?.client_name ?? null;
}
