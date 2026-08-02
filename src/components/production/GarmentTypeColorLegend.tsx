import {
  GARMENT_TYPE_COLOR_LEGEND,
  garmentTypeLegendEntry,
} from "@/lib/production/garment-type-colors";

export function GarmentTypeColorLegend() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Garment colors
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {GARMENT_TYPE_COLOR_LEGEND.map((key) => {
          const styles = garmentTypeLegendEntry(key);
          return (
            <span
              key={key}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styles.chip}`}
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${styles.bg} ring-1 ring-black/10`} />
              {styles.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
