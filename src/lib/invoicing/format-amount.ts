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
