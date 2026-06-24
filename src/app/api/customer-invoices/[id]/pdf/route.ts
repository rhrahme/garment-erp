import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { generateCustomerInvoicePdf } from "@/lib/invoicing/generate-pdf";
import { prepareCustomerInvoiceDocument } from "@/lib/invoicing/prepare-invoice-document";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await context.params;
    const prepared = await prepareCustomerInvoiceDocument(id);
    if (!prepared) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    const pdfBytes = await generateCustomerInvoicePdf(prepared.invoice);

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${prepared.invoiceNumber}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to generate customer invoice PDF:", error);
    return NextResponse.json({ error: "Failed to generate PDF." }, { status: 500 });
  }
}
