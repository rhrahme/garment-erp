"use client";

import { useMeasurementUnitPreference } from "@/hooks/useMeasurementUnitPreference";
import { unitLabel } from "@/lib/pattern-library/measurements";
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
  /**
   * Sheet/base stored unit. When set, shows "Show X | stores Y" so operators
   * never confuse the display toggle with what is saved in the DB.
   */
  storedUnit?: MeasurementUnit;
};

/** Site-wide cm | inches control for Pattern measurement display. */
export function MeasurementUnitToggle({
  className,
  onUnitChange,
  disabled = false,
  size = "sm",
  storedUnit,
}: MeasurementUnitToggleProps) {
  const { unit, setUnit, hydrated } = useMeasurementUnitPreference();
  const mismatch = storedUnit != null && storedUnit !== unit;

  if (!hydrated) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2",
          className
        )}
        aria-hidden
      >
        <div
          className={cn(
            "inline-flex rounded-lg bg-slate-100 p-0.5 ring-1 ring-slate-200",
            size === "md" ? "h-9 w-36" : "h-7 w-28"
          )}
        />
      </div>
    );
  }

  return (
    <div className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <div
        className="inline-flex rounded-lg bg-slate-100 p-0.5 ring-1 ring-slate-200"
        role="group"
        aria-label="Display measurement unit"
        title="Display only: how numbers appear and how you type. Does not rewrite stored sheet values."
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
      {storedUnit != null ? (
        <p
          className={cn(
            "text-xs",
            mismatch
              ? "rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-900 ring-1 ring-amber-200"
              : "text-slate-500"
          )}
          title={
            mismatch
              ? `You type and see ${unitLabel(unit)}; values are saved as ${unitLabel(storedUnit)} (converted on each cell).`
              : `Display and storage both use ${unitLabel(storedUnit)}.`
          }
        >
          Show {unitLabel(unit)}
          {" | "}
          sheet stores {unitLabel(storedUnit)}
          {mismatch ? " (auto-converts)" : ""}
        </p>
      ) : null}
    </div>
  );
}
