import { Badge } from "@/components/ui/Badge";
import {
  getDeliveryDestination,
  type DeliveryDestination,
} from "@/lib/shipping/delivery-destinations";

function badgeClassName(id: DeliveryDestination): string {
  if (id === "RUH") return "bg-emerald-100 text-emerald-800";
  return "bg-sky-100 text-sky-800";
}

type DeliveryDestinationBadgeProps = {
  destination: DeliveryDestination | null | undefined;
  /** When true, show a warning if destination is missing. */
  warnIfMissing?: boolean;
};

export function DeliveryDestinationBadge({
  destination,
  warnIfMissing = false,
}: DeliveryDestinationBadgeProps) {
  if (!destination) {
    if (!warnIfMissing) return null;
    return (
      <Badge className="bg-amber-100 text-amber-800" title="Set RUH or DXB on the sales order">
        No destination
      </Badge>
    );
  }

  const info = getDeliveryDestination(destination);
  return (
    <Badge className={badgeClassName(destination)} title={info?.label ?? destination}>
      <span className="font-semibold">{destination}</span>
      {info?.city ? <span className="ml-1.5 font-normal opacity-90">{info.city}</span> : null}
    </Badge>
  );
}

type DeliveryDestinationBadgesProps = {
  destinations: Array<DeliveryDestination | null | undefined>;
  warnIfMissing?: boolean;
};

/** One badge per unique destination — e.g. combined batches spanning RUH and DXB. */
export function DeliveryDestinationBadges({
  destinations,
  warnIfMissing = false,
}: DeliveryDestinationBadgesProps) {
  const unique = [
    ...new Set(destinations.filter((value): value is DeliveryDestination => Boolean(value))),
  ].sort();

  if (unique.length === 0) {
    return warnIfMissing ? <DeliveryDestinationBadge destination={null} warnIfMissing /> : null;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {unique.map((destination) => (
        <DeliveryDestinationBadge key={destination} destination={destination} />
      ))}
    </span>
  );
}
