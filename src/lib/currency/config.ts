/** Book rate for EUR → SAR (rounded from market ~4.38). */
export const EUR_TO_SAR =
  Number.parseFloat(process.env.EUR_TO_SAR ?? "4.5") || 4.5;

/** USD → SAR at the Saudi riyal peg. */
export const USD_TO_SAR =
  Number.parseFloat(process.env.USD_TO_SAR ?? "3.75") || 3.75;

/** Alert when live EUR/SAR exceeds this value. */
export const EUR_SAR_ALERT_THRESHOLD =
  Number.parseFloat(process.env.EUR_SAR_ALERT_THRESHOLD ?? "4.5") || 4.5;

export type PriceCurrency = "USD" | "EUR";

const USD_SUPPLIER_IDS = new Set(["zegna", "stylbiella"]);

export function getSupplierPriceCurrency(supplierId: string): PriceCurrency {
  return USD_SUPPLIER_IDS.has(supplierId) ? "USD" : "EUR";
}

export function toSar(amount: number, currency: PriceCurrency): number {
  const rate = currency === "USD" ? USD_TO_SAR : EUR_TO_SAR;
  return amount * rate;
}
