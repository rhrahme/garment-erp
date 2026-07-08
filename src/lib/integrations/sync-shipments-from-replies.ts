import { createInboundShipmentFromAwb } from "@/lib/integrations/create-inbound-shipment";
import { getShipmentByAwb } from "@/lib/integrations/shipment-store";
import { listSupplierReplies } from "@/lib/integrations/supplier-reply-store";

/** Create inbound shipments for AWBs logged on supplier replies but missing from the tracker. */
export async function createMissingShipmentsFromReplies(limit = 500): Promise<number> {
  let created = 0;

  for (const reply of listSupplierReplies(limit)) {
    for (const awb_number of reply.awb_numbers ?? []) {
      if (getShipmentByAwb(awb_number)) continue;

      const result = await createInboundShipmentFromAwb({
        awb_number,
        purchase_order_id: reply.purchase_order_id ?? null,
        po_number: reply.po_number,
        supplier_id: reply.supplier_id,
      });
      if (result.created) created += 1;
    }
  }

  return created;
}
