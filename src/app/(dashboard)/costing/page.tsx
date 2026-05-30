import { PageHeader, DataTable } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { getStyleCosts } from "@/lib/data/queries";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default async function CostingPage() {
  const costs = await getStyleCosts();

  return (
    <div>
      <PageHeader
        title="Costing"
        description="Bill of materials, labor, washing, and margin analysis per style"
        action={<Button>Recalculate Costs</Button>}
      />

      <DataTable
        columns={[
          { key: "style", label: "Style" },
          { key: "material", label: "Material" },
          { key: "labor", label: "Labor" },
          { key: "washing", label: "Washing" },
          { key: "overhead", label: "Overhead" },
          { key: "total", label: "Total Cost" },
          { key: "sell", label: "Sell Price" },
          { key: "margin", label: "Margin" },
        ]}
        rows={costs.map((c) => ({
          style: (
            <div>
              <p className="font-medium">{c.style?.style_code}</p>
              <p className="text-xs text-slate-400">{c.style?.name}</p>
            </div>
          ),
          material: formatCurrency(c.material_cost),
          labor: formatCurrency(c.labor_cost),
          washing: formatCurrency(c.washing_cost),
          overhead: formatCurrency(c.overhead_cost),
          total: <span className="font-semibold">{formatCurrency(c.total_cost)}</span>,
          sell: c.style?.selling_price ? formatCurrency(c.style.selling_price) : "—",
          margin: c.margin_pct != null ? (
            <span className={c.margin_pct >= 50 ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>
              {formatNumber(c.margin_pct, 1)}%
            </span>
          ) : "—",
        }))}
      />
    </div>
  );
}
