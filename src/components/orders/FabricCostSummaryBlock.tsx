import {
  formatFabricCostHint,
  formatFabricCostSummary,
  type FabricCostSummary,
} from "@/lib/sales-orders/fabric-cost";

export function FabricCostSummaryBlock({
  summary,
  error = null,
}: {
  summary: FabricCostSummary;
  error?: string | null;
}) {
  const hint = error ?? formatFabricCostHint(summary);

  return (
    <div className="mt-3 border-t border-emerald-300/70 pt-3">
      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-900">
        Fabric cost (supplier)
      </p>
      {error ? (
        <p className="mt-1 text-base font-semibold text-red-700">{error}</p>
      ) : (
        <p className="mt-1 text-xl font-bold text-slate-900">{formatFabricCostSummary(summary)}</p>
      )}
      {hint && !error ? <p className="mt-1 text-xs text-slate-600">{hint}</p> : null}
      {summary.line_count > 0 ? (
        <p className="mt-1 text-[11px] text-slate-500">
          {summary.priced_line_count}/{summary.line_count} lines priced
        </p>
      ) : null}
    </div>
  );
}
