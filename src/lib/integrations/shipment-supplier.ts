import type { PurchaseOrder } from "@/lib/types/fabric-sourcing";
import type { ShipmentRecord } from "@/lib/integrations/shipment-store";

export function resolveShipmentSupplierName(
  shipment: ShipmentRecord,
  fabricOrders: PurchaseOrder[]
): string | null {
  if (shipment.direction !== "inbound") return null;

  const po = shipment.purchase_order_id
    ? fabricOrders.find((order) => order.id === shipment.purchase_order_id)
    : shipment.po_number
      ? fabricOrders.find(
          (order) => order.po_number.toUpperCase() === shipment.po_number!.toUpperCase()
        )
      : undefined;

  return po?.supplier?.name ?? null;
}

export function enrichShipmentsWithSupplierName(
  shipments: ShipmentRecord[],
  fabricOrders: PurchaseOrder[]
): Array<ShipmentRecord & { supplier_name: string | null }> {
  return shipments.map((shipment) => ({
    ...shipment,
    supplier_name: resolveShipmentSupplierName(shipment, fabricOrders),
  }));
}
