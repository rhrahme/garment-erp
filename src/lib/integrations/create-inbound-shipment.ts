import { getSupplierDefaultCarrier } from "@/lib/data/supplier-catalogs";
import { notifyIntegration } from "@/lib/integrations";
import {
  createShipment,
  getShipmentByAwb,
  type ShipmentRecord,
} from "@/lib/integrations/shipment-store";
import { isTrack17Configured } from "@/lib/integrations/track17/config";
import { registerShipmentWith17Track } from "@/lib/integrations/track17/sync-shipments";

export type CreateInboundShipmentInput = {
  awb_number: string;
  carrier?: string;
  purchase_order_id?: string | null;
  po_number?: string | null;
  supplier_id?: string | null;
};

export type CreateInboundShipmentResult = {
  shipment: ShipmentRecord;
  created: boolean;
};

export async function createInboundShipmentFromAwb(
  input: CreateInboundShipmentInput
): Promise<CreateInboundShipmentResult> {
  const awb_number = input.awb_number.trim();
  const existing = getShipmentByAwb(awb_number);
  if (existing) {
    return { shipment: existing, created: false };
  }

  const carrier =
    input.carrier?.trim() ||
    getSupplierDefaultCarrier(input.supplier_id) ||
    "DHL";

  const shipment = createShipment({
    awb_number,
    carrier,
    purchase_order_id: input.purchase_order_id ?? null,
    po_number: input.po_number?.trim() ?? null,
    status: "in_transit",
    direction: "inbound",
    estimated_arrival: null,
  });

  if (isTrack17Configured()) {
    void registerShipmentWith17Track(shipment).catch((error) => {
      console.error("17TRACK register failed:", error);
    });
  }

  void notifyIntegration("awb.received", {
    id: shipment.id,
    awb_number: shipment.awb_number,
    carrier: shipment.carrier,
    po_number: shipment.po_number,
    purchase_order_id: shipment.purchase_order_id,
    status: shipment.status,
    estimated_arrival: shipment.estimated_arrival,
  });

  return { shipment, created: true };
}
