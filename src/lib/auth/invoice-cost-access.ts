import { canViewMoney } from "@/lib/auth/invoice-amounts-access";
import type { CustomerInvoice, CustomerInvoiceSummary } from "@/lib/types/customer-invoices";
import type { InvoiceableSalesOrder } from "@/lib/types/invoiceable-orders";

/** Selling amounts remain visible; only internal costing metadata is removed. */
export function redactCustomerInvoiceCosts(invoice: CustomerInvoice): CustomerInvoice {
  return {
    ...invoice,
    total_cost_sar: null,
    payments: Array.isArray(invoice.payments) ? invoice.payments : [],
    lines: invoice.lines.map((line) => ({
      ...line,
      cost_hint_sar: null,
      fabric_cost_hint_sar: null,
    })),
  };
}

/** Strip every monetary field so non-admin payloads cannot leak prices. */
export function redactCustomerInvoiceMoney(invoice: CustomerInvoice): CustomerInvoice {
  const withoutCosts = redactCustomerInvoiceCosts(invoice);
  return {
    ...withoutCosts,
    subtotal: 0,
    vat_amount: 0,
    total: 0,
    total_cost_sar: null,
    lines: withoutCosts.lines.map((line) => ({
      ...line,
      unit_price: 0,
      line_total: 0,
      cost_hint_sar: null,
      fabric_cost_hint_sar: null,
    })),
    payments: withoutCosts.payments.map((payment) => ({ ...payment, amount: 0 })),
  };
}

export function redactCustomerInvoiceSummary(summary: CustomerInvoiceSummary): CustomerInvoiceSummary {
  return {
    ...summary,
    outstanding_sar: 0,
    paid_sar: 0,
  };
}

export function customerInvoiceForSession(
  session: { isAdmin?: boolean },
  invoice: CustomerInvoice
): CustomerInvoice {
  return canViewMoney(session) ? invoice : redactCustomerInvoiceMoney(invoice);
}

export function invoiceableOrderForSession(
  session: { isAdmin?: boolean },
  order: InvoiceableSalesOrder
): InvoiceableSalesOrder {
  return canViewMoney(session) ? order : { ...order, estimated_cost_sar: null };
}
