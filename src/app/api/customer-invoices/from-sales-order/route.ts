import { NextResponse } from "next/server";
import {
  generateInvoiceId,
  generateInvoiceNumber,
  readCustomerInvoicesFresh,
  saveCustomerInvoice,
} from "@/lib/data/customer-invoices";
import { getSalesOrderByIdFresh } from "@/lib/data/sales-orders";
import { buildDraftInvoiceFromSalesOrder } from "@/lib/invoicing/build-invoice";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";

export async function POST(request: Request) {
  try {
    await ensureDocumentsLoaded(["customer_invoices", "sales_orders", "costing_rates", "clients"]);

    const body = (await request.json()) as { sales_order_id?: string };
    const salesOrderId = String(body.sales_order_id ?? "").trim();
    if (!salesOrderId) {
      return NextResponse.json({ error: "sales_order_id is required." }, { status: 400 });
    }

    const order = await getSalesOrderByIdFresh(salesOrderId);
    if (!order) {
      return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    }

    const store = await readCustomerInvoicesFresh();
    const existing = store.invoices.find((invoice) => invoice.sales_order_id === salesOrderId);
    if (existing) {
      return NextResponse.json(
        { error: "An invoice already exists for this sales order.", invoice: existing },
        { status: 409 }
      );
    }

    const invoiceNumber = generateInvoiceNumber(store.invoices);
    const invoiceId = generateInvoiceId();
    const draft = buildDraftInvoiceFromSalesOrder(order, invoiceNumber, invoiceId);
    const saved = await saveCustomerInvoice(draft);

    return NextResponse.json(saved, { status: 201 });
  } catch (error) {
    console.error("Failed to create customer invoice:", error);
    const message = error instanceof Error ? error.message : "Failed to create invoice.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
