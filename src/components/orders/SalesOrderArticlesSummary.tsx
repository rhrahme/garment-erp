import { GarmentPiecesNest } from "@/components/garment/GarmentPiecesNest";
import {
  buildSalesOrderArticlesSummary,
  formatAggregateMeters,
} from "@/lib/sales-orders/articles-summary";
import type { SalesOrderFabricLine } from "@/lib/types/sales-orders";

function AggregatePills({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; line_count: number; total_meters: number }>;
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item.label}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
          >
            <span className="font-medium text-slate-900">{item.label}</span>
            <span className="text-slate-400">&middot;</span>
            <span>
              {item.line_count} line{item.line_count !== 1 ? "s" : ""}
            </span>
            <span className="text-slate-400">&middot;</span>
            <span className="font-medium tabular-nums text-emerald-800">
              {formatAggregateMeters(item.total_meters)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function SalesOrderArticlesSummary({ lines }: { lines: SalesOrderFabricLine[] }) {
  if (lines.length === 0) return null;

  const summary = buildSalesOrderArticlesSummary(lines);

  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Articles & quantities</h2>
          <p className="mt-1 text-sm text-slate-600">
            {summary.line_count} fabric line{summary.line_count !== 1 ? "s" : ""}{" "}
            &middot;{" "}
            <span className="font-medium tabular-nums text-slate-900">
              {summary.total_meters.toFixed(1)} m
            </span>
            {summary.total_kg != null ? (
              <>
                {" "}
                &middot;{" "}
                <span className="font-medium tabular-nums text-slate-900">
                  {summary.total_kg.toFixed(1)} kg
                </span>
              </>
            ) : null}
          </p>
        </div>
      </div>

      <div className="mt-4 max-h-64 overflow-y-auto rounded-lg border border-slate-100">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 text-center">Art.</th>
              <th className="px-3 py-2">Garment</th>
              <th className="px-3 py-2">Fabric</th>
              <th className="px-3 py-2">Supplier</th>
              <th className="px-3 py-2 text-right">Meters</th>
            </tr>
          </thead>
          <tbody>
            {summary.lines.map((line) => (
              <tr key={line.line_id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 text-center font-semibold text-slate-900">{line.article_label}</td>
                <td className="px-3 py-2 text-slate-700">
                  <span className="font-medium text-slate-900">{line.garment_type}</span>
                  <GarmentPiecesNest
                    garmentType={line.garment_type}
                    pieces={line.pieces}
                    className="mt-0.5 space-y-0.5 text-xs text-slate-600"
                  />
                </td>
                <td className="px-3 py-2 font-mono text-slate-800">{line.fabric_number}</td>
                <td className="px-3 py-2 text-slate-600">{line.supplier_label}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-900">
                  {line.meters.toFixed(1)} m
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <AggregatePills title="By garment" items={summary.by_garment} />
        <AggregatePills title="By supplier" items={summary.by_supplier} />
      </div>
    </section>
  );
}
