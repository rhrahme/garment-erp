import {
  getShipmentByAwb,
  getShipmentById,
  listStoredShipments,
  updateShipmentById,
  type ShipmentRecord,
} from "@/lib/integrations/shipment-store";
import { resolveTrack17CarrierCode } from "@/lib/integrations/track17/carrier-codes";
import { isTrack17Configured } from "@/lib/integrations/track17/config";
import { registerTrackings, getTrackInfo } from "@/lib/integrations/track17/client";
import { shipmentPatchFrom17Track } from "@/lib/integrations/track17/apply-tracking";
import type { Track17TrackingPayload } from "@/lib/integrations/track17/types";

export type Track17SyncResult = {
  registered: number;
  updated: number;
  errors: string[];
};

function carrierCodeForShipment(shipment: ShipmentRecord): number | undefined {
  return shipment.track17_carrier_code ?? resolveTrack17CarrierCode(shipment.carrier) ?? undefined;
}

function applyPayloadToShipment(payload: Track17TrackingPayload): boolean {
  const shipment = getShipmentById(payload.tag ?? "") ?? getShipmentByAwb(payload.number);
  if (!shipment) return false;

  updateShipmentById(shipment.id, shipmentPatchFrom17Track(payload, shipment));
  return true;
}

export async function registerShipmentWith17Track(shipment: ShipmentRecord): Promise<void> {
  if (!isTrack17Configured() || shipment.track17_registered) return;

  const carrier = carrierCodeForShipment(shipment);
  const input = {
    number: shipment.awb_number,
    tag: shipment.id,
    ...(carrier ? { carrier } : {}),
  };

  const response = await registerTrackings([input]);
  if (response.code !== 0) {
    throw new Error(response.message ?? "17TRACK register failed");
  }

  const accepted = response.data?.accepted ?? [];
  for (const item of accepted) {
    applyPayloadToShipment(item);
  }

  const rejected = response.data?.rejected ?? [];
  const alreadyRegistered = rejected.some((item) => item.error?.code === -18019904);
  if (alreadyRegistered) {
    updateShipmentById(shipment.id, { track17_registered: true });
    return;
  }

  if (rejected.length > 0 && accepted.length === 0) {
    throw new Error(rejected[0]?.error?.message ?? "17TRACK rejected registration");
  }
}

export async function syncShipmentsWith17Track(): Promise<Track17SyncResult> {
  if (!isTrack17Configured()) {
    throw new Error("17TRACK is not configured. Add TRACK17_API_KEY to .env.local.");
  }

  const result: Track17SyncResult = { registered: 0, updated: 0, errors: [] };
  const openShipments = listStoredShipments().filter((shipment) => shipment.status !== "delivered");

  const toRegister = openShipments.filter((shipment) => !shipment.track17_registered);
  for (let index = 0; index < toRegister.length; index += 40) {
    const batch = toRegister.slice(index, index + 40);
    try {
      const response = await registerTrackings(
        batch.map((shipment) => ({
          number: shipment.awb_number,
          tag: shipment.id,
          ...(carrierCodeForShipment(shipment)
            ? { carrier: carrierCodeForShipment(shipment) }
            : {}),
        }))
      );

      if (response.code !== 0) {
        result.errors.push(response.message ?? "Register batch failed");
        continue;
      }

      for (const item of response.data?.accepted ?? []) {
        if (applyPayloadToShipment(item)) result.registered += 1;
      }

      for (const rejected of response.data?.rejected ?? []) {
        if (rejected.error?.code === -18019904) {
          const shipment = getShipmentByAwb(rejected.number);
          if (shipment) {
            updateShipmentById(shipment.id, { track17_registered: true });
            result.registered += 1;
          }
          continue;
        }
        result.errors.push(`${rejected.number}: ${rejected.error?.message ?? "rejected"}`);
      }
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : "Register batch failed");
    }
  }

  const toRefresh = listStoredShipments().filter((shipment) => shipment.status !== "delivered");
  for (let index = 0; index < toRefresh.length; index += 40) {
    const batch = toRefresh.slice(index, index + 40);
    try {
      const response = await getTrackInfo(
        batch.map((shipment) => ({
          number: shipment.awb_number,
          ...(carrierCodeForShipment(shipment)
            ? { carrier: carrierCodeForShipment(shipment) }
            : {}),
        }))
      );

      if (response.code !== 0) {
        result.errors.push(response.message ?? "Track info batch failed");
        continue;
      }

      for (const item of response.data?.accepted ?? []) {
        if (applyPayloadToShipment(item)) result.updated += 1;
      }

      for (const rejected of response.data?.rejected ?? []) {
        result.errors.push(`${rejected.number}: ${rejected.error?.message ?? "not found"}`);
      }
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : "Track info batch failed");
    }
  }

  return result;
}

export function apply17TrackWebhookPayload(payload: Track17TrackingPayload): boolean {
  return applyPayloadToShipment(payload);
}
