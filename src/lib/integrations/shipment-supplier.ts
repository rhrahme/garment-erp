import { getSupplierByIdFromContactsSync } from "@/lib/data/supplier-contacts";
import type { PurchaseOrder } from "@/lib/types/fabric-sourcing";
import type { ShipmentRecord } from "@/lib/integrations/shipment-store";
import type { SupplierReplyRecord } from "@/lib/integrations/supplier-reply-store";

function resolveSupplierNameFromId(supplierId: string | null | undefined): string | null {
  if (!supplierId) return null;
  return getSupplierByIdFromContactsSync(supplierId)?.name ?? null;
}

function findLinkedFabricOrder(
  shipment: ShipmentRecord,
  fabricOrders: PurchaseOrder[]
): PurchaseOrder | undefined {
  if (shipment.purchase_order_id) {
    return fabricOrders.find((order) => order.id === shipment.purchase_order_id);
  }
  if (shipment.po_number) {
    const normalized = shipment.po_number.toUpperCase();
    return fabricOrders.find((order) => order.po_number.toUpperCase() === normalized);
  }
  return undefined;
}

export function supplierNameForFabricOrder(po: PurchaseOrder): string | null {
  return po.supplier?.name ?? resolveSupplierNameFromId(po.supplier_id);
}

function buildReplyIndexByAwb(replies: SupplierReplyRecord[]): Map<string, SupplierReplyRecord> {
  const index = new Map<string, SupplierReplyRecord>();
  for (const reply of replies) {
    for (const awb of reply.awb_numbers ?? []) {
      index.set(awb.toUpperCase(), reply);
    }
  }
  return index;
}

export function resolveShipmentSupplierName(
  shipment: ShipmentRecord,
  fabricOrders: PurchaseOrder[],
  replyByAwb?: Map<string, SupplierReplyRecord>
): string | null {
  if (shipment.direction !== "inbound") return null;

  const po = findLinkedFabricOrder(shipment, fabricOrders);
  const fromPo = po ? supplierNameForFabricOrder(po) : null;
  if (fromPo) return fromPo;

  const reply = replyByAwb?.get(shipment.awb_number.toUpperCase());
  return resolveSupplierNameFromId(reply?.supplier_id);
}

export function enrichShipmentsWithSupplierName(
  shipments: ShipmentRecord[],
  fabricOrders: PurchaseOrder[],
  replies: SupplierReplyRecord[] = []
): Array<ShipmentRecord & { supplier_name: string | null }> {
  const replyByAwb = buildReplyIndexByAwb(replies);
  return shipments.map((shipment) => ({
    ...shipment,
    supplier_name: resolveShipmentSupplierName(shipment, fabricOrders, replyByAwb),
  }));
}
