"use client";

import { Ruler } from "lucide-react";
import { MeasurementUnitToggle } from "@/components/pattern/library/MeasurementUnitToggle";

/** PageHeader action: site-wide Pattern cm | inches preference. */
export function PatternMeasurementUnitControl() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <Ruler className="h-4 w-4 text-slate-500" aria-hidden />
      <span className="text-xs font-medium text-slate-600">Units</span>
      <MeasurementUnitToggle size="md" />
    </div>
  );
}
