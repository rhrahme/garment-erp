"use client";

import { useMemo, useState } from "react";
import { Calculator, ChevronDown, ChevronRight } from "lucide-react";
import { FactoryBrandTabs } from "@/components/brands/FactoryBrandTabs";
import { OrderCostDetailPanel } from "@/components/costing/OrderCostDetailPanel";
import { StatusBadge, StatCard } from "@/components/ui/PageHeader";
import { getBrandClientCodePrefix } from "@/lib/clients/codes";
import type { CostingOverview, SalesOrderCost } from "@/lib/costing/compute";
import { useFactoryBrandFilter } from "@/hooks/useFactoryBrandFilter";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

function formatSar(amount: number | null): string {
  if (amount == null) return "—";
  return formatCurrency(amount, "SAR");
}

function OrderCostRow({
  order,
  open,
  onToggle,
}: {
  order: SalesOrderCost;
  open: boolean;
  onToggle: () => void;
}) {
  const partial = order.lines_missing_price > 0;

  return (
    <>
      <tr
        className={cn(
          "cursor-pointer hover:bg-slate-50/80",
          open && "bg-indigo-50/50"
        )}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={open}
        aria-label={`${order.so_number} — ${order.client_name}. ${open ? "Hide" : "Show"} fabric list.`}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5 font-medium text-slate-900">
            {open ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-indigo-500" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
            )}
            <span>{order.so_number}</span>
            <span className="text-xs font-normal text-slate-400">{open ? "Hide fabrics" : "Show fabrics"}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <p className="font-medium">{order.client_name}</p>
          <p className="font-mono text-xs text-slate-400">{order.client_code}</p>
        </td>
        <td className="px-4 py-3">{formatDate(order.order_date)}</td>
        <td className="px-4 py-3">{order.line_count}</td>
        <td className="px-4 py-3">{formatSar(order.fabric_cost_sar)}</td>
        <td className="px-4 py-3 text-xs text-amber-700" title="Recoverable VAT — cash tied up until claimed">
          {order.vat_recoverable_sar > 0 ? formatSar(order.vat_recoverable_sar) : "—"}
        </td>
        <td className="px-4 py-3">{formatSar(order.labor_cost_sar)}</td>
        <td className="px-4 py-3">{formatSar(order.washing_cost_sar)}</td>
        <td className="px-4 py-3">{formatSar(order.overhead_cost_sar)}</td>
        <td className="px-4 py-3 font-semibold">
          {formatSar(order.total_cost_sar)}
          {partial && (
            <span className="ml-1 text-xs font-normal text-amber-600" title="Some fabric prices missing">
              *
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={order.status} />
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={11} className="p-0">
            <OrderCostDetailPanel order={order} />
          </td>
        </tr>
      )}
    </>
  );
}

export function CostingWorkspace({ overview }: { overview: CostingOverview }) {
  const { brandId, setBrandId, hydrated } = useFactoryBrandFilter();
  const [showArchived, setShowArchived] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const orders = useMemo(() => {
    let result = overview.orders;
    if (!showArchived) {
      result = result.filter((order) => !order.is_archived);
    }
    if (brandId) {
      const prefix = getBrandClientCodePrefix(brandId);
      if (prefix) {
        result = result.filter(
          (order) => order.client_code.startsWith(`${prefix}-`) || order.client_code === prefix
        );
      }
    }
    return result;
  }, [brandId, overview.orders, showArchived]);

  const filteredTotals = useMemo(() => {
    const fabricBase = orders.reduce((sum, order) => sum + order.fabric_base_sar, 0);
    const customs = orders.reduce((sum, order) => sum + order.customs_duty_sar, 0);
    const vatRecoverable = orders.reduce((sum, order) => sum + order.vat_recoverable_sar, 0);
    const fabricCash = orders.reduce((sum, order) => sum + order.fabric_cash_outlay_sar, 0);
    const fabric = orders.reduce((sum, order) => sum + order.fabric_cost_sar, 0);
    const labor = orders.reduce((sum, order) => sum + order.labor_cost_sar, 0);
    const washing = orders.reduce((sum, order) => sum + order.washing_cost_sar, 0);
    const overhead = orders.reduce((sum, order) => sum + order.overhead_cost_sar, 0);
    const missing = orders.reduce((sum, order) => sum + order.lines_missing_price, 0);
    const lines = orders.reduce((sum, order) => sum + order.line_count, 0);
    return {
      fabricBase,
      customs,
      vatRecoverable,
      fabricCash,
      fabric,
      labor,
      washing,
      overhead,
      total: fabric + labor + washing + overhead,
      missing,
      lines,
    };
  }, [orders]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-violet-200 bg-violet-50 px-5 py-4 text-sm text-violet-950">
        <p className="font-medium">How costing is calculated</p>
        <p className="mt-1 text-violet-900">
          <span className="font-medium">Fabric</span> = supplier price (SAR) +{" "}
          <span className="font-medium">5% customs duty</span> on imported fabrics.{" "}
          <span className="font-medium">15% import VAT</span> is paid when fabric arrives — reclaimable later, but
          ties up cash for months (shown separately, not in garment total).{" "}
          <span className="font-medium">Gliani warehouse stock</span> skips duty &amp; VAT. Labor / wash / overhead from{" "}
          <code className="rounded bg-violet-100 px-1 text-xs">costing-rates.json</code>.
        </p>
        <p className="mt-2 text-violet-800">
          <span className="font-medium">Click an order row</span> to see the full costing breakdown here — fabrics, price
          per metre, landed cost, labor, wash, overhead, and line totals. Everything stays on this page.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Active orders"
          value={orders.length}
          subtext={`${filteredTotals.lines} fabric lines`}
          icon={<Calculator className="h-5 w-5" />}
          accent="bg-violet-50 text-violet-600"
        />
        <StatCard
          label="Fabric (landed)"
          value={formatSar(filteredTotals.fabric)}
          subtext={`${formatSar(filteredTotals.customs)} customs duty incl.`}
          accent="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          label="VAT recoverable"
          value={formatSar(filteredTotals.vatRecoverable)}
          subtext={`${formatSar(filteredTotals.fabricCash)} cash at import`}
          accent="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Make cost"
          value={formatSar(filteredTotals.labor + filteredTotals.washing + filteredTotals.overhead)}
          subtext="Labor + wash + overhead"
          accent="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Total estimated"
          value={formatSar(filteredTotals.total)}
          subtext={
            filteredTotals.missing > 0
              ? `${filteredTotals.missing} line${filteredTotals.missing !== 1 ? "s" : ""} missing fabric price`
              : "All lines priced"
          }
          accent="bg-emerald-50 text-emerald-600"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {hydrated && (
          <FactoryBrandTabs value={brandId} onChange={setBrandId} showAll allLabel="All brands" label="Filter by brand" />
        )}
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded border-slate-300"
          />
          Include archived orders
        </label>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          No bespoke sales orders to cost yet — create orders under Sales Orders first.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Lines</th>
                <th className="px-4 py-3">Fabric</th>
                <th className="px-4 py-3">VAT (recover)</th>
                <th className="px-4 py-3">Labor</th>
                <th className="px-4 py-3">Wash</th>
                <th className="px-4 py-3">Overhead</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => (
                <OrderCostRow
                  key={order.order_id}
                  order={order}
                  open={expandedOrderId === order.order_id}
                  onToggle={() =>
                    setExpandedOrderId((current) => (current === order.order_id ? null : order.order_id))
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
