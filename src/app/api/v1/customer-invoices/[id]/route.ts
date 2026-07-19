import { NextResponse } from "next/server";
import { getCustomerInvoiceByIdFresh, saveCustomerInvoice } from "@/lib/data/customer-invoices";
import { notifyIntegration } from "@/lib/integrations";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { recalculateInvoiceTotals } from "@/lib/invoicing/build-invoice";
import { applyCustomerInvoiceStatusChange } from "@/lib/invoicing/customer-invoice-mutations";
import type { CustomerInvoiceLine, CustomerInvoiceStatus } from "@/lib/types/customer-invoices";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  const { id } = await context.params;
  const invoice = await getCustomerInvoiceByIdFresh(id);
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  const body = (await request.json()) as {
    status?: CustomerInvoiceStatus;
    invoice_date?: string;
    due_date?: string | null;
    payment_terms?: string | null;
    notes?: string | null;
    vat_rate?: number | null;
    lines?: Array<Partial<CustomerInvoiceLine> & { id: string }>;
  };
  let next = { ...invoice };
  if (body.invoice_date) next.invoice_date = body.invoice_date;
  if (body.due_date !== undefined) next.due_date = body.due_date;
  if (body.payment_terms !== undefined) next.payment_terms = body.payment_terms;
  if (body.notes !== undefined) next.notes = body.notes;
  if (body.vat_rate !== undefined) next.vat_rate = body.vat_rate;
  if (body.lines) {
    next.lines = next.lines.map((line) => {
      const patch = body.lines!.find((item) => item.id === line.id);
      if (!patch) return line;
      const quantity = patch.quantity == null ? line.quantity : Number(patch.quantity);
      const unitPrice = patch.unit_price == null ? line.unit_price : Number(patch.unit_price);
      return {
        ...line,
        description: patch.description == null ? line.description : String(patch.description),
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : line.quantity,
        unit_price: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : line.unit_price,
        line_total: quantity * unitPrice,
      };
    });
  }
  next = { ...next, ...recalculateInvoiceTotals(next.lines, next.vat_rate) };
  const saved = body.status
    ? await applyCustomerInvoiceStatusChange(next, body.status, { source: "api" })
    : await saveCustomerInvoice(next);
  await notifyIntegration(
    "invoice.updated",
    { id: saved.id, invoice_number: saved.invoice_number, status: saved.status },
    "api"
  );
  return NextResponse.json({ invoice: saved });
}
