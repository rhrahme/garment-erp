"use client";

import { useMemo } from "react";
import { DualCurrencyPrice } from "@/components/currency/DualCurrencyPrice";
import { FabricSwatchProvider } from "@/components/fabric/FabricSwatchProvider";
import { FabricNumberWithSwatch } from "@/components/fabric/FabricSwatchPreview";
import { getSupplierPriceCurrency, toSar } from "@/lib/currency/config";
import type { FabricLineCost, SalesOrderCost } from "@/lib/costing/compute";
import { formatCurrency, formatDate } from "@/lib/utils";

function formatSar(amount: number | null): string {
  if (amount == null) return "—";
  return formatCurrency(amount, "SAR");
}

function formatArticle(articleNumber: number): string {
  return `L${String(articleNumber).padStart(2, "0")}`;
}

function formatWeight(weightGsm: number | null): string {
  return weightGsm != null ? `${weightGsm} gsm` : "—";
}

function formatSupplierLineTotal(line: FabricLineCost): string {
  if (line.supplier_line_total == null) return "—";
  const currency = getSupplierPriceCurrency(line.supplier_id);
  const supplier = formatCurrency(line.supplier_line_total, currency);
  const sar = formatCurrency(toSar(line.supplier_line_total, currency), "SAR");
  return `${supplier} · ${sar}`;
}

function CostSummaryTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function FabricLineRow({ line }: { line: FabricLineCost }) {
  return (
    <tr className="border-b border-slate-100 align-top">
      <td className="px-3 py-3 text-center font-semibold text-slate-900">{formatArticle(line.article_number)}</td>
      <td className="px-3 py-3 text-slate-900">
        <FabricNumberWithSwatch supplierId={line.supplier_id} fabricNumber={line.fabric_number} />
      </td>
      <td className="px-3 py-3 text-slate-700">{line.supplier_name}</td>
      <td className="px-3 py-3 text-slate-800">{line.garment_type}</td>
      <td className="px-3 py-3 text-slate-600">{line.composition ?? "—"}</td>
      <td className="px-3 py-3 text-slate-600">{formatWeight(line.weight_gsm)}</td>
      <td className="px-3 py-3 text-slate-600">{line.width_label ?? "—"}</td>
      <td className="px-3 py-3 text-slate-600">{line.color ?? "—"}</td>
      <td className="px-3 py-3 font-medium text-slate-900">{line.meters} m</td>
      <td className="px-3 py-3">
        {line.unit_price != null ? (
          <DualCurrencyPrice amount={line.unit_price} supplierId={line.supplier_id} unit={line.unit} />
        ) : (
          <span className="text-amber-600">No price</span>
        )}
      </td>
      <td className="px-3 py-3 font-medium text-slate-900">{formatSupplierLineTotal(line)}</td>
      <td className="px-3 py-3 text-slate-700">
        {formatSar(line.fabric_cost_sar)}
        {line.customs_duty_sar > 0 && (
          <span className="mt-0.5 block text-xs text-slate-400">incl. {formatSar(line.customs_duty_sar)} duty</span>
        )}
      </td>
      <td className="px-3 py-3 text-slate-600">{formatSar(line.labor_cost_sar)}</td>
      <td className="px-3 py-3 text-slate-600">{formatSar(line.washing_cost_sar)}</td>
      <td className="px-3 py-3 text-slate-600">{formatSar(line.overhead_cost_sar)}</td>
      <td className="px-3 py-3 font-semibold text-slate-900">{formatSar(line.total_cost_sar)}</td>
    </tr>
  );
}

export function OrderCostDetailPanel({ order }: { order: SalesOrderCost }) {
  const swatchFabrics = useMemo(
    () =>
      order.lines.map((line) => ({
        supplier_id: line.supplier_id,
        fabric_number: line.fabric_number,
      })),
    [order.lines]
  );

  const supplierFabricTotal = order.lines.reduce((sum, line) => {
    if (line.supplier_line_total == null) return sum;
    return sum + toSar(line.supplier_line_total, getSupplierPriceCurrency(line.supplier_id));
  }, 0);

  return (
    <FabricSwatchProvider fabrics={swatchFabrics}>
    <div className="border-t border-indigo-100 bg-indigo-50/40 px-4 py-4">
      <div className="mb-4">
        <p className="text-sm font-semibold text-slate-900">
          {order.so_number} · {order.client_name}
        </p>
        <p className="mt-0.5 text-xs text-slate-600">
          <span className="font-mono">{order.client_code}</span>
          {order.client_reference ? ` · Ref ${order.client_reference}` : ""}
          {order.product_article ? ` · ${order.product_article}` : ""}
          {" · "}
          {formatDate(order.order_date)}
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <CostSummaryTile label="Fabric (supplier)" value={formatSar(order.fabric_base_sar)} />
        <CostSummaryTile label="Customs duty" value={formatSar(order.customs_duty_sar)} />
        <CostSummaryTile label="Fabric landed" value={formatSar(order.fabric_cost_sar)} />
        <CostSummaryTile label="Labor" value={formatSar(order.labor_cost_sar)} />
        <CostSummaryTile label="Wash + overhead" value={formatSar(order.washing_cost_sar + order.overhead_cost_sar)} />
        <CostSummaryTile
          label="Garment total"
          value={formatSar(order.total_cost_sar)}
          hint={order.lines_missing_price > 0 ? `${order.lines_missing_price} line(s) missing price` : undefined}
        />
      </div>

      {order.vat_recoverable_sar > 0 && (
        <p className="mb-4 text-xs text-amber-800">
          VAT recoverable (cash at import, not in garment total): {formatSar(order.vat_recoverable_sar)} · Cash outlay{" "}
          {formatSar(order.fabric_cash_outlay_sar)}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Art.</th>
              <th className="px-3 py-2">Fabric #</th>
              <th className="px-3 py-2">Supplier</th>
              <th className="px-3 py-2">Garment</th>
              <th className="px-3 py-2">Composition</th>
              <th className="px-3 py-2">Weight</th>
              <th className="px-3 py-2">Width</th>
              <th className="px-3 py-2">Colour</th>
              <th className="px-3 py-2">Ordered</th>
              <th className="px-3 py-2">Price / m</th>
              <th className="px-3 py-2">Fabric total</th>
              <th className="px-3 py-2">Landed</th>
              <th className="px-3 py-2">Labor</th>
              <th className="px-3 py-2">Wash</th>
              <th className="px-3 py-2">OH</th>
              <th className="px-3 py-2">Line total</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => (
              <FabricLineRow key={line.line_id} line={line} />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50 font-medium text-slate-900">
              <td colSpan={8} className="px-3 py-3 text-right text-xs uppercase tracking-wide text-slate-500">
                Order totals
              </td>
              <td className="px-3 py-3">{order.line_count} lines</td>
              <td className="px-3 py-3">—</td>
              <td className="px-3 py-3">{formatSar(Math.round(supplierFabricTotal * 100) / 100)}</td>
              <td className="px-3 py-3">{formatSar(order.fabric_cost_sar)}</td>
              <td className="px-3 py-3">{formatSar(order.labor_cost_sar)}</td>
              <td className="px-3 py-3">{formatSar(order.washing_cost_sar)}</td>
              <td className="px-3 py-3">{formatSar(order.overhead_cost_sar)}</td>
              <td className="px-3 py-3 font-semibold">{formatSar(order.total_cost_sar)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
    </FabricSwatchProvider>
  );
}
