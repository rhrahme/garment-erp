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
import { requireAuthenticated } from "@/lib/auth/session";
import { canAccessSalesOrder } from "@/lib/sales/access";
import { notifyIntegration } from "@/lib/integrations";
import { redactCustomerInvoiceCosts } from "@/lib/auth/invoice-cost-access";

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticated();
    if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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
    if (!canAccessSalesOrder(session, order)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
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
    await notifyIntegration("invoice.created", {
      id: saved.id,
      invoice_number: saved.invoice_number,
      sales_order_id: saved.sales_order_id,
      created_by: session.email,
      total: saved.total,
    });

    return NextResponse.json(
      session.isSalesOperator ? redactCustomerInvoiceCosts(saved) : saved,
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create customer invoice:", error);
    const message = error instanceof Error ? error.message : "Failed to create invoice.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
