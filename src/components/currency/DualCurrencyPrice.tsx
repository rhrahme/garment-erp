import { getSupplierPriceCurrency } from "@/lib/currency/config";
import { formatDualCurrencyPrice } from "@/lib/currency/format";

interface DualCurrencyPriceProps {
  amount: number | null | undefined;
  supplierId: string;
  unit?: string;
  layout?: "stacked" | "inline";
  /** Override supplier default currency (e.g. custom / one-off fabrics). */
  currency?: "USD" | "EUR" | "AED" | null;
}

export function DualCurrencyPrice({
  amount,
  supplierId,
  unit = "m",
  layout = "stacked",
  currency: currencyOverride,
}: DualCurrencyPriceProps) {
  if (amount == null) {
    return <span className="text-slate-400">—</span>;
  }

  const unitLabel = unit === "meters" ? "m" : unit;
  const currency = currencyOverride ?? getSupplierPriceCurrency(supplierId);
  const { original, sar } = formatDualCurrencyPrice(amount, currency, unitLabel);

  if (layout === "inline") {
    return (
      <span className="text-sm">
        <span className="font-medium text-slate-900">{original}</span>
        <span className="text-slate-400"> · </span>
        <span className="text-slate-600">{sar}</span>
      </span>
    );
  }

  return (
    <div className="leading-tight">
      <div className="font-medium text-slate-900">{original}</div>
      <div className="text-xs text-slate-500">{sar}</div>
    </div>
  );
}
