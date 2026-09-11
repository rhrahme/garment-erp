import { NextResponse } from "next/server";
import { readCustomerInvoicesFresh } from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getSalesOrdersByIdsFresh } from "@/lib/data/sales-orders";
import { createCustomerInvoiceFromSalesOrders } from "@/lib/invoicing/customer-invoice-mutations";
import { invoiceCoversSalesOrder } from "@/lib/invoicing/invoice-sales-orders";
import { verifyApiKey } from "@/lib/integrations/api-auth";

function parseSalesOrderIds(body: { sales_order_id?: string; sales_order_ids?: string[] }): string[] {
  const listed = [
    ...(Array.isArray(body.sales_order_ids) ? body.sales_order_ids : []),
    body.sales_order_id ?? "",
  ];
  return [...new Set(listed.map((id) => String(id).trim()).filter(Boolean))];
}

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  await ensureDocumentsLoaded(["customer_invoices", "sales_orders", "costing_rates", "clients"]);
  const body = (await request.json()) as { sales_order_id?: string; sales_order_ids?: string[] };
  const salesOrderIds = parseSalesOrderIds(body);
  if (salesOrderIds.length === 0) {
    return NextResponse.json({ error: "sales_order_id is required." }, { status: 400 });
  }
  const orders = await getSalesOrdersByIdsFresh(salesOrderIds);
  if (orders.length !== salesOrderIds.length) {
    return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
  }
  const store = await readCustomerInvoicesFresh();
  const existing = store.invoices.find((invoice) =>
    salesOrderIds.some((id) => invoiceCoversSalesOrder(invoice, id))
  );
  if (existing) return NextResponse.json({ error: "Invoice already exists.", invoice: existing }, { status: 409 });
  const saved = await createCustomerInvoiceFromSalesOrders(orders, null, "api");
  return NextResponse.json({ invoice: saved }, { status: 201 });
}
