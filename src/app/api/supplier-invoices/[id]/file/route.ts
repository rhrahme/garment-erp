import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  getSupplierInvoice,
  readSupplierInvoiceFile,
} from "@/lib/integrations/supplier-invoice-store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDocumentsLoaded(["supplier_invoices"]);

    const { id } = await context.params;
    const invoice = getSupplierInvoice(id);
    if (!invoice) {
      return NextResponse.json({ error: "Supplier invoice not found." }, { status: 404 });
    }

    const content = await readSupplierInvoiceFile(invoice);
    if (!content) {
      return NextResponse.json({ error: "Supplier invoice file not found." }, { status: 404 });
    }

    const filename = invoice.original_filename ?? "supplier-invoice.pdf";
    return new NextResponse(content, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(content.length),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to open supplier invoice.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
