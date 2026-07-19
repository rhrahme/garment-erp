import type { CustomerInvoice } from "@/lib/types/customer-invoices";

/** Selling amounts remain visible; only internal costing metadata is removed. */
export function redactCustomerInvoiceCosts(invoice: CustomerInvoice): CustomerInvoice {
  return {
    ...invoice,
    total_cost_sar: null,
    lines: invoice.lines.map((line) => ({
      ...line,
      cost_hint_sar: null,
      fabric_cost_hint_sar: null,
    })),
  };
}
