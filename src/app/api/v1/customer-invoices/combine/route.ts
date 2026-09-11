import { NextResponse } from "next/server";
import { readCustomerInvoicesFresh } from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { canCombineCustomerInvoices } from "@/lib/invoicing/combine-invoices";
import { combineDraftCustomerInvoices } from "@/lib/invoicing/customer-invoice-mutations";
import { verifyApiKey } from "@/lib/integrations/api-auth";

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  await ensureDocumentsLoaded(["customer_invoices", "sales_orders", "costing_rates", "clients"]);

  const body = (await request.json()) as { invoice_ids?: string[] };
  const invoiceIds = [...new Set((body.invoice_ids ?? []).map((id) => String(id).trim()).filter(Boolean))];
  if (invoiceIds.length < 2) {
    return NextResponse.json({ error: "invoice_ids must include at least two invoices." }, { status: 400 });
  }

  const store = await readCustomerInvoicesFresh();
  const invoices = invoiceIds.map((id) => store.invoices.find((invoice) => invoice.id === id));
  if (invoices.some((invoice) => !invoice)) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }
  const found = invoices.filter((invoice): invoice is NonNullable<typeof invoice> => Boolean(invoice));
  const problem = canCombineCustomerInvoices(found);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const saved = await combineDraftCustomerInvoices(found, null, "api");
  return NextResponse.json({ invoice: saved });
}
