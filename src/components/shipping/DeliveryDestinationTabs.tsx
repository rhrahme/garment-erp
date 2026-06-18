"use client";

import { getDeliveryDestinations, type DeliveryDestination } from "@/lib/shipping/delivery-destinations";

type DeliveryDestinationTabsProps = {
  value: DeliveryDestination | "";
  onChange: (value: DeliveryDestination) => void;
  disabled?: boolean;
  label?: string;
};

export function DeliveryDestinationTabs({
  value,
  onChange,
  disabled,
  label = "Ship fabrics to",
}: DeliveryDestinationTabsProps) {
  const destinations = getDeliveryDestinations();

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <div className="flex w-full flex-col gap-1 rounded-lg border border-slate-200 bg-white p-1 sm:inline-flex sm:w-auto sm:flex-row">
        {destinations.map((destination) => {
          const active = value === destination.id;
          return (
            <button
              key={destination.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(destination.id)}
              className={`min-h-[44px] flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-colors sm:min-h-0 sm:flex-none sm:py-2 ${
                active
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              }`}
            >
              <span className="font-semibold">{destination.id}</span>
              <span className={`ml-2 text-xs ${active ? "text-indigo-100" : "text-slate-400"}`}>
                {destination.city}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** @deprecated Use DeliveryDestinationTabs */
export const DeliveryDestinationPicker = DeliveryDestinationTabs;
