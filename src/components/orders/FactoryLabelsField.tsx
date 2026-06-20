"use client";

import { getLabelCountForGarment } from "@/lib/sales-orders/garment-types";
import { cn } from "@/lib/utils";

/**
 * Read-only factory label count in fabric add flows (SalesOrderForm,
 * ProductionOrderAddFabrics, OrderFabricLineEditor).
 *
 * Do not remove — mobile users rely on visible Factory labels count;
 * auto-only hint text caused regression Jun 2026.
 */
export function FactoryLabelsField({
  garmentType,
  className,
  valueClassName,
  hint = "Auto from garment type (e.g. suit = 2).",
}: {
  garmentType: string;
  className?: string;
  valueClassName?: string;
  hint?: string;
}) {
  const count = garmentType ? getLabelCountForGarment(garmentType) : null;

  return (
    <label className={cn("block text-sm", className)}>
      <span className="font-medium text-slate-700">Factory labels</span>
      <p
        className={cn(
          "mt-1 flex min-h-[44px] items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-semibold tabular-nums text-slate-900",
          valueClassName
        )}
        aria-live="polite"
      >
        {count != null ? count : "—"}
      </p>
      <span className="mt-1 block text-xs text-slate-500">{hint}</span>
    </label>
  );
}
