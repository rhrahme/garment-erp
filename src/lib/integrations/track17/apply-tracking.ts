import type { ShipmentRecord } from "@/lib/integrations/shipment-store";
import type { Track17TrackInfo, Track17TrackingPayload } from "@/lib/integrations/track17/types";

export function map17TrackStatusToErp(status: string | null | undefined): string {
  switch (status) {
    case "Delivered":
      return "delivered";
    case "InTransit":
      return "in_transit";
    case "OutForDelivery":
      return "out_for_delivery";
    case "AvailableForPickup":
      return "available_for_pickup";
    case "InfoReceived":
      return "info_received";
    case "Exception":
      return "exception";
    case "Expired":
      return "expired";
    case "NotFound":
      return "pending";
    default:
      return "in_transit";
  }
}

function formatEventLocation(trackInfo: Track17TrackInfo | null | undefined): string | null {
  const event = trackInfo?.latest_event;
  if (!event) return null;

  const address = event.address;
  const parts = [address?.city, address?.state, address?.country].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  if (event.location?.trim()) return event.location.trim();
  return null;
}

function deliveredAtFromTrackInfo(trackInfo: Track17TrackInfo | null | undefined): string | null {
  const deliveredMilestone = trackInfo?.milestone?.find((item) => item.key_stage === "Delivered");
  if (deliveredMilestone?.time_utc) return deliveredMilestone.time_utc;

  if (trackInfo?.latest_status?.status === "Delivered") {
    return trackInfo.latest_event?.time_utc ?? trackInfo.latest_event?.time_iso ?? null;
  }

  return null;
}

export function buildTrackingUrl(awbNumber: string): string {
  return `https://www.17track.net/en/track?nums=${encodeURIComponent(awbNumber)}`;
}

export function shipmentPatchFrom17Track(
  payload: Track17TrackingPayload,
  existing?: ShipmentRecord
): Partial<ShipmentRecord> {
  const trackInfo = payload.track_info;
  const packageStatus = trackInfo?.latest_status?.status ?? null;
  const latestEvent = trackInfo?.latest_event;
  const estimatedTo = trackInfo?.time_metrics?.estimated_delivery_date?.to ?? null;
  const deliveredAt = deliveredAtFromTrackInfo(trackInfo);

  return {
    track17_carrier_code: payload.carrier ?? existing?.track17_carrier_code ?? null,
    track17_registered: true,
    tracking_status: packageStatus,
    status: map17TrackStatusToErp(packageStatus),
    current_location: formatEventLocation(trackInfo),
    latest_event: latestEvent?.description?.trim() ?? null,
    latest_event_at: latestEvent?.time_utc ?? latestEvent?.time_iso ?? null,
    estimated_arrival: estimatedTo ?? existing?.estimated_arrival ?? null,
    delivered_at: deliveredAt ?? existing?.delivered_at ?? null,
    tracking_updated_at: new Date().toISOString(),
    tracking_url: buildTrackingUrl(payload.number),
  };
}
