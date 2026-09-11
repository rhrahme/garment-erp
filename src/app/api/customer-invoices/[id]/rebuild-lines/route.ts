import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { getCustomerInvoiceByIdFresh } from "@/lib/data/customer-invoices";
import { getSalesOrdersByIdsFresh } from "@/lib/data/sales-orders";
import { invoiceSalesOrderIds } from "@/lib/invoicing/invoice-sales-orders";
import { applyCustomerInvoiceLineRebuild } from "@/lib/invoicing/customer-invoice-mutations";
import { getInvoiceAmountPaid } from "@/lib/invoicing/payments";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { canAccessSalesOrder } from "@/lib/sales/access";
import { customerInvoiceForSession } from "@/lib/auth/invoice-cost-access";
import { notifyIntegration } from "@/lib/integrations";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    await ensureDocumentsLoaded(["customer_invoices", "sales_orders", "costing_rates", "clients"]);

    const { id } = await context.params;
    const invoice = await getCustomerInvoiceByIdFresh(id);
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }
    if (invoice.status === "paid" || getInvoiceAmountPaid(invoice) > 0) {
      return NextResponse.json(
        { error: "Invoices with payments cannot be rebuilt." },
        { status: 400 }
      );
    }

    const orders = await getSalesOrdersByIdsFresh(invoiceSalesOrderIds(invoice));
    if (orders.length === 0) {
      return NextResponse.json({ error: "Linked sales order not found." }, { status: 404 });
    }
    if (!orders.some((order) => canAccessSalesOrder(session, order))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const saved = await applyCustomerInvoiceLineRebuild(invoice, orders);
    await notifyIntegration("invoice.updated", {
      id: saved.id,
      invoice_number: saved.invoice_number,
      updated_by: session.email,
      action: "rebuild_lines",
    });
    return NextResponse.json(customerInvoiceForSession(session, saved));
  } catch (error) {
    console.error("Failed to rebuild customer invoice lines:", error);
    return NextResponse.json({ error: "Failed to rebuild invoice lines." }, { status: 500 });
  }
}
