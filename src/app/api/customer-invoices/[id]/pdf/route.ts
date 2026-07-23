import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { generateCustomerInvoicePdf } from "@/lib/invoicing/generate-pdf";
import { prepareCustomerInvoiceDocument } from "@/lib/invoicing/prepare-invoice-document";
import { getSalesOrderByIdFresh } from "@/lib/data/sales-orders";
import { canAccessSalesOrder } from "@/lib/sales/access";
import { getCustomerInvoiceByIdFresh } from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await context.params;
    await ensureDocumentsLoaded(["clients", "sales_orders", "customer_invoices"]);
    const prepared = await prepareCustomerInvoiceDocument(id);
    if (!prepared) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }
    const rawInvoice = await getCustomerInvoiceByIdFresh(id);
    const order = rawInvoice
      ? await getSalesOrderByIdFresh(rawInvoice.sales_order_id)
      : null;
    if (!order || !canAccessSalesOrder(session, order)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
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
