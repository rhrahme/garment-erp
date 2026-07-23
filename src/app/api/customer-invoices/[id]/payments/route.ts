import { NextResponse } from "next/server";
import path from "path";
import { requireAuthenticated } from "@/lib/auth/session";
import { redactCustomerInvoiceCosts } from "@/lib/auth/invoice-cost-access";
import { getCustomerInvoiceByIdFresh } from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded, invalidateDocumentCache } from "@/lib/data/document-persistence";
import { getSalesOrderByIdFresh } from "@/lib/data/sales-orders";
import { recordCustomerInvoicePayment } from "@/lib/invoicing/customer-invoice-mutations";
import { getInvoiceAmountPaid, getInvoiceBalanceDue } from "@/lib/invoicing/payments";
import { canAccessSalesOrder } from "@/lib/sales/access";
import type { CustomerInvoicePaymentMethod } from "@/lib/types/customer-invoices";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthenticated();
    if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    await ensureDocumentsLoaded(["clients", "sales_orders", "customer_invoices"]);
    invalidateDocumentCache(path.join(process.cwd(), "src/data/customer-invoices.json"));

    const { id } = await context.params;
    const invoice = await getCustomerInvoiceByIdFresh(id);
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    const order = await getSalesOrderByIdFresh(invoice.sales_order_id);
    if (!order || !canAccessSalesOrder(session, order)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = (await request.json()) as {
      amount?: number;
      paid_at?: string | null;
      method?: CustomerInvoicePaymentMethod | string | null;
      notes?: string | null;
    };

    const result = await recordCustomerInvoicePayment(
      invoice,
      {
        amount: Number(body.amount),
        paid_at: body.paid_at,
        method: body.method,
        notes: body.notes,
      },
      session.email,
      "erp"
    );

    invalidateDocumentCache(path.join(process.cwd(), "src/data/customer-invoices.json"));
    const payload = session.isSalesOperator
      ? redactCustomerInvoiceCosts(result.invoice)
      : result.invoice;

    return NextResponse.json({
      invoice: payload,
      payment: result.payment,
      amount_paid: getInvoiceAmountPaid(result.invoice),
      balance_due: getInvoiceBalanceDue(result.invoice),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record payment.";
    if (message.includes("greater than zero")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("Failed to record customer invoice payment:", error);
    return NextResponse.json({ error: "Failed to record payment." }, { status: 500 });
  }
}
