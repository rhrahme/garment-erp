function formatPlainInvoiceAmount(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2);
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

/** PDF-safe SAR — no thousands separators (jspdf-autotable truncates at commas in narrow cells). */
export function formatInvoiceSarForPdf(amount: number): string {
  return `SAR ${formatPlainInvoiceAmount(amount)}`;
}

/** PDF-safe DHS — no thousands separators. */
export function formatInvoiceDhsForPdf(amount: number): string {
  return `${formatPlainInvoiceAmount(amount)} DHS`;
}
