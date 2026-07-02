import { getSupplierPriceCurrency, toSar, type PriceCurrency } from "@/lib/currency/config";
import type { SalesOrderFabricLine } from "@/lib/types/sales-orders";
import { formatCurrency } from "@/lib/utils";

export interface FabricCostSummary {
  line_count: number;
  priced_line_count: number;
  missing_price_line_count: number;
  /** Sum of supplier line totals converted to SAR. */
  total_sar: number;
  /** Raw supplier totals before FX conversion. */
  totals_by_currency: Partial<Record<PriceCurrency, number>>;
}

export function fabricLineSupplierTotal(line: SalesOrderFabricLine): number | null {
  if (line.unit_price == null || line.unit_price <= 0) return null;
  if (line.quantity <= 0) return null;
  return Math.round(line.unit_price * line.quantity * 100) / 100;
}

export function getFabricCostSummary(lines: SalesOrderFabricLine[]): FabricCostSummary {
  const totalsByCurrency: Partial<Record<PriceCurrency, number>> = {};
  let pricedLineCount = 0;
  let totalSar = 0;

  for (const line of lines) {
    const lineTotal = fabricLineSupplierTotal(line);
    if (lineTotal == null) continue;

    pricedLineCount += 1;
    const currency = getSupplierPriceCurrency(line.supplier_id);
    totalsByCurrency[currency] = Math.round(((totalsByCurrency[currency] ?? 0) + lineTotal) * 100) / 100;
    totalSar += toSar(lineTotal, currency);
  }

  return {
    line_count: lines.length,
    priced_line_count: pricedLineCount,
    missing_price_line_count: lines.length - pricedLineCount,
    total_sar: Math.round(totalSar * 100) / 100,
    totals_by_currency: totalsByCurrency,
  };
}

export function formatFabricCostSummary(summary: FabricCostSummary): string {
  if (summary.priced_line_count === 0) return "—";

  const sar = formatCurrency(summary.total_sar, "SAR");
  const currencyTotals = Object.entries(summary.totals_by_currency) as [PriceCurrency, number][];

  if (currencyTotals.length === 1) {
    const [currency, amount] = currencyTotals[0];
    return `${formatCurrency(amount, currency)} · ${sar}`;
  }

  return sar;
}

export function formatFabricCostHint(summary: FabricCostSummary): string | null {
  if (summary.priced_line_count === 0) return null;
  if (summary.missing_price_line_count === 0) return null;
  const missingWord = summary.missing_price_line_count === 1 ? "line" : "lines";
  return `${summary.missing_price_line_count} ${missingWord} without price`;
}
