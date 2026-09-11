import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { customerInvoiceForSession } from "@/lib/auth/invoice-cost-access";
import { readCustomerInvoicesFresh } from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getSalesOrdersByIdsFresh } from "@/lib/data/sales-orders";
import { canCombineCustomerInvoices } from "@/lib/invoicing/combine-invoices";
import { combineDraftCustomerInvoices } from "@/lib/invoicing/customer-invoice-mutations";
import { invoiceCoversSalesOrder, invoiceSalesOrderIds } from "@/lib/invoicing/invoice-sales-orders";
import { salesOrderMatchesInvoiceClient } from "@/lib/invoicing/invoice-client-match";
import { canAccessSalesOrder } from "@/lib/sales/access";

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticated();
    if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    await ensureDocumentsLoaded(["customer_invoices", "sales_orders", "costing_rates", "clients"]);

    const body = (await request.json()) as { invoice_ids?: string[]; sales_order_ids?: string[] };
    const invoiceIds = [...new Set((body.invoice_ids ?? []).map((id) => String(id).trim()).filter(Boolean))];
    const extraOrderIds = [
      ...new Set((body.sales_order_ids ?? []).map((id) => String(id).trim()).filter(Boolean)),
    ];
    if (invoiceIds.length < 2 && extraOrderIds.length === 0) {
      return NextResponse.json(
        { error: "Select at least two invoices, or one invoice and a sales order." },
        { status: 400 }
      );
    }
    if (invoiceIds.length === 0) {
      return NextResponse.json({ error: "invoice_ids is required." }, { status: 400 });
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

    const orders = await getSalesOrdersByIdsFresh(found.flatMap((invoice) => invoiceSalesOrderIds(invoice)));
    if (orders.length === 0 || orders.some((order) => !canAccessSalesOrder(session, order))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const extraOrders = await getSalesOrdersByIdsFresh(extraOrderIds);
    if (extraOrders.length !== extraOrderIds.length) {
      return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    }
    if (extraOrders.some((order) => !canAccessSalesOrder(session, order))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
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
      return NextResponse.json(
        { error: "Sales orders must belong to the same client." },
        { status: 400 }
      );
    }

    const saved = await combineDraftCustomerInvoices(found, session.email, "erp", extraOrders);
    return NextResponse.json(customerInvoiceForSession(session, saved));
  } catch (error) {
    console.error("Failed to combine customer invoices:", error);
    const message = error instanceof Error ? error.message : "Failed to combine invoices.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
