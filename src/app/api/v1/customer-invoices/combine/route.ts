import { NextResponse } from "next/server";
import { readCustomerInvoicesFresh } from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { canCombineCustomerInvoices } from "@/lib/invoicing/combine-invoices";
import { combineDraftCustomerInvoices } from "@/lib/invoicing/customer-invoice-mutations";
import { getSalesOrdersByIdsFresh } from "@/lib/data/sales-orders";
import { invoiceCoversSalesOrder } from "@/lib/invoicing/invoice-sales-orders";
import { salesOrderMatchesInvoiceClient } from "@/lib/invoicing/invoice-client-match";
import { verifyApiKey } from "@/lib/integrations/api-auth";

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  await ensureDocumentsLoaded(["customer_invoices", "sales_orders", "costing_rates", "clients"]);

  const body = (await request.json()) as { invoice_ids?: string[]; sales_order_ids?: string[] };
  const invoiceIds = [...new Set((body.invoice_ids ?? []).map((id) => String(id).trim()).filter(Boolean))];
  const extraOrderIds = [
    ...new Set((body.sales_order_ids ?? []).map((id) => String(id).trim()).filter(Boolean)),
  ];
  if (invoiceIds.length === 0 || (invoiceIds.length < 2 && extraOrderIds.length === 0)) {
    return NextResponse.json(
      { error: "Send at least two invoice_ids, or one invoice_id with sales_order_ids." },
      { status: 400 }
    );
  }

  const store = await readCustomerInvoicesFresh();
  const invoices = invoiceIds.map((id) => store.invoices.find((invoice) => invoice.id === id));
  if (invoices.some((invoice) => !invoice)) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }
  const found = invoices.filter((invoice): invoice is NonNullable<typeof invoice> => Boolean(invoice));
  if (found.length > 1) {
    const problem = canCombineCustomerInvoices(found);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  } else if (found[0]!.status !== "draft") {
    return NextResponse.json({ error: "Only draft invoices can be combined." }, { status: 400 });
  }

  const extraOrders = await getSalesOrdersByIdsFresh(extraOrderIds);
  if (extraOrders.length !== extraOrderIds.length) {
    return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
  }
  const alreadyInvoiced = extraOrders.find((order) =>
    store.invoices.some((invoice) => invoiceCoversSalesOrder(invoice, order.id))
  );
  if (alreadyInvoiced) {
    return NextResponse.json(
      { error: `An invoice already exists for ${alreadyInvoiced.so_number}.` },
      { status: 409 }
    );
  }
  if (extraOrders.some((order) => !salesOrderMatchesInvoiceClient(found[0]!, order))) {
    return NextResponse.json({ error: "Sales orders must belong to the same client." }, { status: 400 });
  }

  const saved = await combineDraftCustomerInvoices(found, null, "api", extraOrders);
  return NextResponse.json({ invoice: saved });
}
