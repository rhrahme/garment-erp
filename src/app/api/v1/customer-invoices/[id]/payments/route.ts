import { NextResponse } from "next/server";
import { getCustomerInvoiceByIdFresh } from "@/lib/data/customer-invoices";
import { recordCustomerInvoicePayment } from "@/lib/invoicing/customer-invoice-mutations";
import { getInvoiceAmountPaid, getInvoiceBalanceDue } from "@/lib/invoicing/payments";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import type { CustomerInvoicePaymentMethod } from "@/lib/types/customer-invoices";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  const { id } = await context.params;
  const invoice = await getCustomerInvoiceByIdFresh(id);
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  const body = (await request.json()) as {
    amount?: number;
    paid_at?: string | null;
    method?: CustomerInvoicePaymentMethod | string | null;
    notes?: string | null;
    recorded_by?: string | null;
  };

  try {
    const result = await recordCustomerInvoicePayment(
      invoice,
      {
        amount: Number(body.amount),
        paid_at: body.paid_at,
        method: body.method,
        notes: body.notes,
      },
      body.recorded_by?.trim() || null,
      "api"
    );

    return NextResponse.json({
      invoice: result.invoice,
      payment: result.payment,
      amount_paid: getInvoiceAmountPaid(result.invoice),
      balance_due: getInvoiceBalanceDue(result.invoice),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record payment.";
    if (message.includes("greater than zero")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("Failed to record invoice payment via API:", error);
    return NextResponse.json({ error: "Failed to record payment." }, { status: 500 });
  }
}
