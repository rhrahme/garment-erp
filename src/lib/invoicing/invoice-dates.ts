import { computeDueDate } from "@/lib/invoicing/pricing";
import type { CustomerInvoice } from "@/lib/types/customer-invoices";

/** Earliest YYYY-MM-DD among invoice / sales-order dates (ISO datetimes count as their calendar day). */
export function oldestCalendarDate(
  ...values: Array<string | null | undefined>
): string | undefined {
  const dates = values
    .map((value) => {
      const trimmed = value?.trim();
      if (!trimmed) return null;
      const match = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
      return match?.[1] ?? null;
    })
    .filter((value): value is string => Boolean(value))
    .sort();
  return dates[0];
}

export function invoiceDateFromCoveredOrders(
  invoiceDate: string,
  orderDates: Array<string | null | undefined>
): string {
  return oldestCalendarDate(invoiceDate, ...orderDates) ?? invoiceDate;
}

export function withOldestCoveredInvoiceDate<T extends CustomerInvoice>(
  invoice: T,
  orderDates: Array<string | null | undefined>
): T {
  const invoice_date = invoiceDateFromCoveredOrders(invoice.invoice_date, orderDates);
  if (invoice_date === invoice.invoice_date) return invoice;
  return {
    ...invoice,
    invoice_date,
    due_date: computeDueDate(invoice_date, invoice.payment_terms),
  };
}
