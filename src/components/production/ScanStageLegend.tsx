import { SCAN_STAGE_LEGEND, scanStageStyles } from "@/lib/production/scan-stage-highlight";

export function ScanStageLegend() {
  return (
    <div className="no-print rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Scan colors (screen only — not on print)
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {SCAN_STAGE_LEGEND.map(({ stage, label }) => {
          const styles = scanStageStyles(stage);
          return (
            <span
              key={stage}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styles.chip}`}
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-black/5 ${styles.row}`} />
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
