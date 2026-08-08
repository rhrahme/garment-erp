"use client";

import { useMeasurementUnitPreference } from "@/hooks/useMeasurementUnitPreference";
import type { MeasurementUnit } from "@/lib/types/pattern-library";
import { cn } from "@/lib/utils";

const OPTIONS: { value: MeasurementUnit; label: string }[] = [
  { value: "cm", label: "cm" },
  { value: "in", label: "inches" },
];

type MeasurementUnitToggleProps = {
  className?: string;
  /** When set, called after the site preference updates (e.g. convert open sheet). */
  onUnitChange?: (unit: MeasurementUnit) => void;
  disabled?: boolean;
  size?: "sm" | "md";
};

/** Site-wide cm | inches control for Pattern measurement display. */
export function MeasurementUnitToggle({
  className,
  onUnitChange,
  disabled = false,
  size = "sm",
}: MeasurementUnitToggleProps) {
  const { unit, setUnit, hydrated } = useMeasurementUnitPreference();

  if (!hydrated) {
    return (
      <div
        className={cn(
          "inline-flex rounded-lg bg-slate-100 p-0.5 ring-1 ring-slate-200",
          size === "md" ? "h-9 w-36" : "h-7 w-28",
          className
        )}
        aria-hidden
      />
    );
  }

  return (
    <div
      className={cn(
        "inline-flex rounded-lg bg-slate-100 p-0.5 ring-1 ring-slate-200",
        className
      )}
      role="group"
      aria-label="Measurement unit"
      title="Site-wide: show Pattern measurements in cm or inches"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => {
            if (unit === option.value) return;
            setUnit(option.value);
            onUnitChange?.(option.value);
          }}
          disabled={disabled || unit === option.value}
          className={cn(
            "rounded-md font-medium transition-colors",
            size === "md" ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs",
            unit === option.value
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900 disabled:opacity-50"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
