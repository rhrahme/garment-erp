import { recalculateInvoiceTotals } from "@/lib/invoicing/build-invoice";
import { canCombineCustomerInvoices } from "@/lib/invoicing/combine-invoice-groups";
import { renumberInvoiceArticles } from "@/lib/invoicing/consolidate-lines";
import { oldestCalendarDate } from "@/lib/invoicing/invoice-dates";
import { applyAllInvoiceLineReductions } from "@/lib/invoicing/line-reduction-suggestions";
import { invoiceSalesOrderRefs, withInvoiceSalesOrders } from "@/lib/invoicing/invoice-sales-orders";
import { computeDueDate } from "@/lib/invoicing/pricing";
import type { CustomerInvoice } from "@/lib/types/customer-invoices";

export { canCombineCustomerInvoices, groupCombinableDraftInvoices } from "@/lib/invoicing/combine-invoice-groups";

export function combineCustomerInvoices(
  invoices: CustomerInvoice[],
  options?: { orderDates?: Array<string | null | undefined> }
): CustomerInvoice {
  const problem = canCombineCustomerInvoices(invoices);
  if (problem) throw new Error(problem);

  const sorted = [...invoices].sort((a, b) => a.invoice_number.localeCompare(b.invoice_number));
  const keeper = sorted[0]!;
  const absorbed = sorted.slice(1);
  const lines = applyAllInvoiceLineReductions(sorted.flatMap((invoice) => invoice.lines));
  const renumbered = renumberInvoiceArticles(lines);
  const vatRate = keeper.vat_rate;
  const { lines: pricedLines, subtotal, vat_amount, total } = recalculateInvoiceTotals(
    renumbered,
    vatRate
  );

  const mergedNotes = [
    keeper.notes?.trim(),
    ...absorbed.map((invoice) => invoice.notes?.trim()).filter(Boolean),
    `Combined from ${sorted.map((invoice) => invoice.invoice_number).join(", ")}.`,
  ]
    .filter(Boolean)
    .join("\n");

  const costHints = sorted
    .map((invoice) => invoice.total_cost_sar)
    .filter((value): value is number => value != null && Number.isFinite(value));

  const invoiceDate =
    oldestCalendarDate(
      ...sorted.map((invoice) => invoice.invoice_date),
      ...(options?.orderDates ?? [])
    ) ?? keeper.invoice_date;
  const createdAt = [...sorted.map((invoice) => invoice.created_at).filter(Boolean)].sort()[0] ?? keeper.created_at;

  return withInvoiceSalesOrders(
    {
      ...keeper,
      invoice_date: invoiceDate,
      created_at: createdAt,
      due_date: computeDueDate(invoiceDate, keeper.payment_terms),
      lines: pricedLines,
      subtotal,
      vat_amount,
      total,
      notes: mergedNotes || null,
      status: "draft",
      sent_at: null,
      paid_at: null,
      payments: [],
      total_cost_sar:
        costHints.length > 0 ? costHints.reduce((sum, value) => sum + value, 0) : keeper.total_cost_sar,
    },
    sorted.flatMap((invoice) => invoiceSalesOrderRefs(invoice))
  );
}
