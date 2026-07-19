import { NextResponse } from "next/server";
import {
  generateInvoiceId,
  generateInvoiceNumber,
  readCustomerInvoicesFresh,
  saveCustomerInvoice,
} from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getSalesOrderByIdFresh } from "@/lib/data/sales-orders";
import { notifyIntegration } from "@/lib/integrations";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { buildDraftInvoiceFromSalesOrder } from "@/lib/invoicing/build-invoice";

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  await ensureDocumentsLoaded(["customer_invoices", "sales_orders", "costing_rates", "clients"]);
  const body = (await request.json()) as { sales_order_id?: string };
  const order = await getSalesOrderByIdFresh(String(body.sales_order_id ?? "").trim());
  if (!order) return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
  const store = await readCustomerInvoicesFresh();
  const existing = store.invoices.find((invoice) => invoice.sales_order_id === order.id);
  if (existing) return NextResponse.json({ error: "Invoice already exists.", invoice: existing }, { status: 409 });
  const invoice = buildDraftInvoiceFromSalesOrder(
    order,
    generateInvoiceNumber(store.invoices),
    generateInvoiceId()
  );
  const saved = await saveCustomerInvoice(invoice);
  await notifyIntegration(
    "invoice.created",
    {
      id: saved.id,
      invoice_number: saved.invoice_number,
      sales_order_id: saved.sales_order_id,
      total: saved.total,
    },
    "api"
  );
  return NextResponse.json({ invoice: saved }, { status: 201 });
}
