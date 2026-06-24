/** Book rate for EUR → SAR (rounded from market ~4.38). */
export const EUR_TO_SAR =
  Number.parseFloat(process.env.EUR_TO_SAR ?? "4.5") || 4.5;

/** USD → SAR at the Saudi riyal peg. */
export const USD_TO_SAR =
  Number.parseFloat(process.env.USD_TO_SAR ?? "3.75") || 3.75;

/** AED → SAR (both USD-pegged: 3.75 SAR / 3.6725 AED per USD). */
export const AED_TO_SAR =
  Number.parseFloat(process.env.AED_TO_SAR ?? "1.021") || 1.021;

/** SAR → AED/DHS at the book rate (inverse of AED_TO_SAR). */
export const SAR_TO_AED = 1 / AED_TO_SAR;

/** Convert a SAR invoice amount to UAE dirhams (DHS) for Dubai client payments. */
export function sarToDhs(amountSar: number): number {
  return Math.round(amountSar * SAR_TO_AED * 100) / 100;
}

/** Alert when live EUR/SAR exceeds this value. */
export const EUR_SAR_ALERT_THRESHOLD =
  Number.parseFloat(process.env.EUR_SAR_ALERT_THRESHOLD ?? "4.5") || 4.5;

export type PriceCurrency = "USD" | "EUR" | "AED";

const SUPPLIER_PRICE_CURRENCY: Record<string, PriceCurrency> = {
  zegna: "USD",
  stylbiella: "USD",
  gazaba: "AED",
};

export function getSupplierPriceCurrency(supplierId: string): PriceCurrency {
  return SUPPLIER_PRICE_CURRENCY[supplierId] ?? "EUR";
}

export function toSar(amount: number, currency: PriceCurrency): number {
  const rate =
    currency === "USD" ? USD_TO_SAR : currency === "AED" ? AED_TO_SAR : EUR_TO_SAR;
  return amount * rate;
}
