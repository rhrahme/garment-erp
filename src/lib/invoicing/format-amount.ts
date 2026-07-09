/**
 * Grouped amount for PDFs — comma thousands separators (plain ASCII comma/period, no NBSP).
 * Whole numbers stay clean ("2,100"); any fractional amount shows exactly 2 decimals ("133,300.70")
 * so currency values never render with a lonely single decimal.
 */
function formatGroupedInvoiceAmount(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const fractionDigits = Number.isInteger(rounded) ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(rounded);
}

/** SAR/DHS amounts on customer invoices — omit .00 for whole numbers, keep up to 2 decimals when needed. */
export function formatInvoiceSar(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "SAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatInvoiceDhs(amount: number): string {
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${formatted} DHS`;
}

/** PDF SAR — comma thousands separators (amount columns are sized wide enough to avoid clipping). */
export function formatInvoiceSarForPdf(amount: number): string {
  return `SAR ${formatGroupedInvoiceAmount(amount)}`;
}

/** PDF DHS — comma thousands separators. */
export function formatInvoiceDhsForPdf(amount: number): string {
  return `${formatGroupedInvoiceAmount(amount)} DHS`;
}
