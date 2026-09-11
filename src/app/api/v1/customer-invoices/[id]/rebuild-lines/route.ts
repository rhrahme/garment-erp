import { NextResponse } from "next/server";
import { getCustomerInvoiceByIdFresh } from "@/lib/data/customer-invoices";
import { getSalesOrdersByIdsFresh } from "@/lib/data/sales-orders";
import { invoiceSalesOrderIds } from "@/lib/invoicing/invoice-sales-orders";
import { applyCustomerInvoiceLineRebuild } from "@/lib/invoicing/customer-invoice-mutations";
import { getInvoiceAmountPaid } from "@/lib/invoicing/payments";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
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

    const saved = await applyCustomerInvoiceLineRebuild(invoice, orders);
    return NextResponse.json({ ok: true, invoice: saved });
  } catch (error) {
    console.error("Failed to rebuild customer invoice lines (API):", error);
    return NextResponse.json({ error: "Failed to rebuild invoice lines." }, { status: 500 });
  }
}
