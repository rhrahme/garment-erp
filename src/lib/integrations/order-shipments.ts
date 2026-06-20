import { listStoredFabricOrders } from "@/lib/integrations/fabric-order-store";
import { listStoredShipments, type ShipmentRecord } from "@/lib/integrations/shipment-store";

export function getShipmentsByPo(purchaseOrderId: string): ShipmentRecord[] {
  const po = listStoredFabricOrders().find((order) => order.id === purchaseOrderId);
  const poNumber = po?.po_number.toUpperCase();

  return listStoredShipments().filter((shipment) => {
    if (shipment.purchase_order_id === purchaseOrderId) return true;
    if (poNumber && shipment.po_number?.toUpperCase() === poNumber) return true;
    return false;
  });
}

export function listShipmentsForSalesOrder(input: {
  salesOrderId: string;
  fabricPoIds?: string[];
}): ShipmentRecord[] {
  const poIds = new Set(input.fabricPoIds ?? []);
  const poNumbers = new Set<string>();

  if (poIds.size > 0) {
    for (const po of listStoredFabricOrders()) {
      if (poIds.has(po.id)) {
        poNumbers.add(po.po_number.toUpperCase());
      }
    }
  }

  return listStoredShipments().filter((shipment) => {
    if (shipment.sales_order_id === input.salesOrderId) return true;
    if (shipment.purchase_order_id && poIds.has(shipment.purchase_order_id)) return true;
    if (shipment.po_number && poNumbers.has(shipment.po_number.toUpperCase())) return true;
    return false;
  });
}
