import { listStoredFabricOrders } from "@/lib/integrations/fabric-order-store";
import { supplierNameForFabricOrder } from "@/lib/integrations/shipment-supplier";
import { listStoredShipments } from "@/lib/integrations/shipment-store";
import type { PurchaseOrder } from "@/lib/types/fabric-sourcing";

export type PendingAwbFabricOrder = {
  id: string;
  po_number: string;
  supplier_id: string;
  supplier_name: string | null;
  sales_order_id: string | null;
  client_reference: string | null;
  emailed_at: string;
  expected_carrier: string | null;
};

function poHasShipment(po: PurchaseOrder, shipments: ReturnType<typeof listStoredShipments>): boolean {
  const poNumber = po.po_number.toUpperCase();
  return shipments.some(
    (shipment) =>
      shipment.purchase_order_id === po.id ||
      (shipment.po_number && shipment.po_number.toUpperCase() === poNumber)
  );
}

export function listPendingAwbFabricOrders(): PendingAwbFabricOrder[] {
  const shipments = listStoredShipments();

  return listStoredFabricOrders()
    .filter((po) => Boolean(po.emailed_at))
    .filter((po) => !poHasShipment(po, shipments))
    .map((po) => ({
      id: po.id,
      po_number: po.po_number,
      supplier_id: po.supplier_id,
      supplier_name: supplierNameForFabricOrder(po),
      sales_order_id: po.sales_order_id ?? null,
      client_reference: po.client_reference ?? null,
      emailed_at: po.emailed_at!,
      expected_carrier: po.expected_carrier ?? null,
    }))
    .sort((a, b) => b.emailed_at.localeCompare(a.emailed_at));
}

export function countPendingAwbFabricOrders(): number {
  return listPendingAwbFabricOrders().length;
}
