import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { getCustomerInvoiceByIdFresh } from "@/lib/data/customer-invoices";
import { getSalesOrderByIdFresh } from "@/lib/data/sales-orders";
import { applyCustomerInvoiceLineSync } from "@/lib/invoicing/customer-invoice-mutations";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { canAccessSalesOrder } from "@/lib/sales/access";
import { redactCustomerInvoiceCosts } from "@/lib/auth/invoice-cost-access";
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

    const order = await getSalesOrderByIdFresh(invoice.sales_order_id);
    if (!order) {
      return NextResponse.json({ error: "Linked sales order not found." }, { status: 404 });
    }
    if (!canAccessSalesOrder(session, order)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const saved = await applyCustomerInvoiceLineSync(invoice, order);
    await notifyIntegration("invoice.updated", {
      id: saved.id,
      invoice_number: saved.invoice_number,
      updated_by: session.email,
      action: "sync_lines",
    });
    return NextResponse.json(session.isSalesOperator ? redactCustomerInvoiceCosts(saved) : saved);
  } catch (error) {
    console.error("Failed to sync customer invoice lines:", error);
    return NextResponse.json({ error: "Failed to sync invoice lines." }, { status: 500 });
  }
}
