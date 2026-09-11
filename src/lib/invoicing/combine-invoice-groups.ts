import { getInvoiceAmountPaid } from "@/lib/invoicing/payments";
import type { CustomerInvoice } from "@/lib/types/customer-invoices";

export function canCombineCustomerInvoices(invoices: CustomerInvoice[]): string | null {
  if (invoices.length < 2) return "Select at least two invoices.";
  const clientIds = new Set(invoices.map((invoice) => invoice.client_id.trim()).filter(Boolean));
  const clientCodes = new Set(invoices.map((invoice) => invoice.client_code.trim()).filter(Boolean));
  if (clientIds.size > 1 || clientCodes.size > 1) {
    return "Invoices must belong to the same client.";
  }
  if (invoices.some((invoice) => invoice.status === "paid")) {
    return "Paid invoices cannot be combined.";
  }
  if (invoices.some((invoice) => invoice.status !== "draft")) {
    return "Only draft invoices can be combined.";
  }
  if (invoices.some((invoice) => getInvoiceAmountPaid(invoice) > 0)) {
    return "Invoices with payments cannot be combined.";
  }
  return null;
}

export function groupCombinableDraftInvoices(invoices: CustomerInvoice[]): CustomerInvoice[][] {
  const buckets = new Map<string, CustomerInvoice[]>();
  for (const invoice of invoices) {
    if (invoice.status !== "draft") continue;
    if (getInvoiceAmountPaid(invoice) > 0) continue;
    const key = invoice.client_id.trim() || invoice.client_code.trim();
    if (!key) continue;
    const bucket = buckets.get(key) ?? [];
    bucket.push(invoice);
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .filter((group) => group.length >= 2)
    .sort((a, b) => b.length - a.length);
}
