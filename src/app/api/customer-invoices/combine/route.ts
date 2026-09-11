import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { customerInvoiceForSession } from "@/lib/auth/invoice-cost-access";
import { readCustomerInvoicesFresh } from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getSalesOrdersByIdsFresh } from "@/lib/data/sales-orders";
import { canCombineCustomerInvoices } from "@/lib/invoicing/combine-invoices";
import { combineDraftCustomerInvoices } from "@/lib/invoicing/customer-invoice-mutations";
import { invoiceSalesOrderIds } from "@/lib/invoicing/invoice-sales-orders";
import { canAccessSalesOrder } from "@/lib/sales/access";

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticated();
    if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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

    const orders = await getSalesOrdersByIdsFresh(found.flatMap((invoice) => invoiceSalesOrderIds(invoice)));
    if (orders.length === 0 || orders.some((order) => !canAccessSalesOrder(session, order))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const saved = await combineDraftCustomerInvoices(found, session.email, "erp");
    return NextResponse.json(customerInvoiceForSession(session, saved));
  } catch (error) {
    console.error("Failed to combine customer invoices:", error);
    const message = error instanceof Error ? error.message : "Failed to combine invoices.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
