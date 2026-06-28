import { NextResponse } from "next/server";
import { getSupplierInvoice } from "@/lib/integrations/supplier-invoice-store";
import { saveTransporterInvoiceFile } from "@/lib/integrations/transporter-invoice-store";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supplierInvoice = getSupplierInvoice(id);
    if (!supplierInvoice) {
      return NextResponse.json({ error: "Supplier invoice not found." }, { status: 404 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "A PDF file is required." }, { status: 400 });
    }

    const carrier = String(form.get("carrier") ?? "DHL").trim() || "DHL";
    const expenseTypeRaw = String(form.get("expense_type") ?? "customs");
    const expense_type =
      expenseTypeRaw === "freight" || expenseTypeRaw === "other" ? expenseTypeRaw : "customs";
    const awb_number = String(form.get("awb_number") ?? supplierInvoice.awb_numbers[0] ?? "").trim() || null;
    const invoice_number = String(form.get("invoice_number") ?? "").trim() || null;
    const amount = String(form.get("amount") ?? "").trim() || null;
    const currency = String(form.get("currency") ?? "").trim() || null;
    const payment_url = String(form.get("payment_url") ?? "").trim() || null;

    const buffer = Buffer.from(await file.arrayBuffer());
    const record = saveTransporterInvoiceFile({
      supplier_invoice_id: supplierInvoice.id,
      carrier,
      awb_number,
      invoice_number,
      expense_type,
      amount,
      currency,
      payment_url,
      subject: `Manual upload — ${carrier} ${expense_type}`,
      from_address: "manual-upload",
      received_at: new Date().toISOString(),
      message_id: null,
      original_filename: file.name,
      content: buffer,
      source: "manual_upload",
    });

    if (!record) {
      return NextResponse.json({ error: "Failed to save transporter invoice." }, { status: 500 });
    }

    return NextResponse.json({ invoice: record });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload transporter invoice.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
