import { formatCurrency } from "@/lib/utils";
import { getSupplierPriceCurrency, toSar, type PriceCurrency } from "@/lib/currency/config";

export function formatDualCurrencyPrice(
  amount: number,
  currency: PriceCurrency,
  unit = "m"
): { original: string; sar: string; compact: string } {
  const unitSuffix = `/${unit}`;
  const original = `${formatCurrency(amount, currency)}${unitSuffix}`;
  const sarAmount = toSar(amount, currency);
  const sar = `${formatCurrency(sarAmount, "SAR")}${unitSuffix}`;
  return {
    original,
    sar,
    compact: `${original} · ${sar}`,
  };
}

export function formatSupplierUnitPrice(
  amount: number | null | undefined,
  supplierId: string,
  unit = "m"
): string {
  if (amount == null) return "—";
  const currency = getSupplierPriceCurrency(supplierId);
  const unitLabel = unit === "meters" ? "m" : unit;
  return formatDualCurrencyPrice(amount, currency, unitLabel).compact;
}
