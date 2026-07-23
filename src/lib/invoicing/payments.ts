import type {
  CustomerInvoice,
  CustomerInvoicePayment,
  CustomerInvoicePaymentMethod,
} from "@/lib/types/customer-invoices";

export function roundInvoiceMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function normalizeInvoicePayments(
  payments: CustomerInvoicePayment[] | null | undefined
): CustomerInvoicePayment[] {
  if (!Array.isArray(payments)) return [];
  return payments
    .filter((payment) => payment && Number.isFinite(payment.amount) && payment.amount > 0)
    .map((payment) => ({
      id: String(payment.id),
      amount: roundInvoiceMoney(Number(payment.amount)),
      paid_at: String(payment.paid_at || payment.recorded_at || new Date().toISOString()),
      method: normalizePaymentMethod(payment.method),
      notes: payment.notes?.trim() ? payment.notes.trim() : null,
      recorded_at: String(payment.recorded_at || new Date().toISOString()),
      recorded_by: payment.recorded_by?.trim() ? payment.recorded_by.trim() : null,
    }));
}

export function normalizePaymentMethod(
  value: unknown
): CustomerInvoicePaymentMethod | null {
  if (value === "cash" || value === "transfer" || value === "card" || value === "other") {
    return value;
  }
  return null;
}

/** Sum of recorded payments; legacy fully-paid invoices without a ledger count as fully paid. */
export function getInvoiceAmountPaid(invoice: Pick<CustomerInvoice, "total" | "status" | "payments">): number {
  const payments = normalizeInvoicePayments(invoice.payments);
  const recorded = roundInvoiceMoney(payments.reduce((sum, payment) => sum + payment.amount, 0));
  if (recorded > 0) return recorded;
  if (invoice.status === "paid") return roundInvoiceMoney(invoice.total);
  return 0;
}

export function getInvoiceBalanceDue(invoice: Pick<CustomerInvoice, "total" | "status" | "payments">): number {
  return roundInvoiceMoney(Math.max(0, invoice.total - getInvoiceAmountPaid(invoice)));
}

export function generateInvoicePaymentId(): string {
  return `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function withNormalizedPayments<T extends CustomerInvoice>(invoice: T): T {
  return {
    ...invoice,
    payments: normalizeInvoicePayments(invoice.payments),
  };
}
