import destinationsData from "@/data/delivery-destinations.json";
import type { ShipmentDestination } from "@/lib/integrations/shipment-destination";

export type DeliveryDestination = ShipmentDestination;

export interface DeliveryDestinationInfo {
  id: DeliveryDestination;
  label: string;
  city: string;
}

const catalog = destinationsData as { destinations: DeliveryDestinationInfo[] };

export function getDeliveryDestinations(): DeliveryDestinationInfo[] {
  return catalog.destinations;
}

export function getDeliveryDestination(id: DeliveryDestination | null | undefined): DeliveryDestinationInfo | undefined {
  if (!id) return undefined;
  return catalog.destinations.find((entry) => entry.id === id);
}

export function isDeliveryDestination(value: string): value is DeliveryDestination {
  return value === "RUH" || value === "DXB";
}

/** Supplier-facing ship-to name — may differ from internal destination labels. */
function supplierShipToLabel(destination: DeliveryDestinationInfo): string {
  if (destination.id === "DXB") return "VITA S LTD Dubai";
  if (destination.id === "RUH") return "HAGAN INDUSTRIAL COMPANY Saudi";
  return destination.label;
}

/** One line for supplier emails — suppliers already have the full address on file. */
export function formatShipToForEmail(destination: DeliveryDestinationInfo): string {
  return `Shipping to ${supplierShipToLabel(destination)}`;
}
