import { NextResponse } from "next/server";
import { getCustomerInvoiceByIdFresh } from "@/lib/data/customer-invoices";
import { applyCustomerInvoiceStatusChange } from "@/lib/invoicing/customer-invoice-mutations";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensureDocumentsLoaded(["customer_invoices", "sales_orders"]);
    const { id } = await context.params;
    const invoice = await getCustomerInvoiceByIdFresh(id);
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    if (invoice.status === "paid") {
      return NextResponse.json({ error: "Invoice is already paid." }, { status: 400 });
    }
    if (invoice.status === "sent") {
      return NextResponse.json({ ok: true, invoice });
    }

    const body = (await request.json().catch(() => ({}))) as { sent_at?: string };
    const sentAt =
      typeof body.sent_at === "string" && body.sent_at.trim() ? body.sent_at.trim() : undefined;

    const saved = await applyCustomerInvoiceStatusChange(invoice, "sent", {
      ...(sentAt ? { sent_at: sentAt } : {}),
      source: "api",
    });

    return NextResponse.json({ ok: true, invoice: saved });
  } catch (error) {
    console.error("Failed to mark customer invoice sent (API):", error);
    const message = error instanceof Error ? error.message : "Failed to mark invoice sent.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
