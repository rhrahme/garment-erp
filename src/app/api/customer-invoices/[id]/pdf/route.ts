import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { generateCustomerInvoicePdf } from "@/lib/invoicing/generate-pdf";
import { prepareCustomerInvoiceDocument } from "@/lib/invoicing/prepare-invoice-document";
import { getSalesOrderByIdFresh } from "@/lib/data/sales-orders";
import { canAccessSalesOrder } from "@/lib/sales/access";
import { getCustomerInvoiceByIdFresh } from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await context.params;
    const url = new URL(request.url);
    const kindParam = url.searchParams.get("kind");
    const disposition = url.searchParams.get("disposition") === "inline" ? "inline" : "attachment";
    const kind =
      kindParam === "quote" || kindParam === "invoice" ? kindParam : undefined;

    await ensureDocumentsLoaded(["clients", "sales_orders", "customer_invoices"]);
    const prepared = await prepareCustomerInvoiceDocument(id, { kind });
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
        "Content-Disposition": `${disposition}; filename="${prepared.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to generate customer invoice PDF:", error);
    return NextResponse.json({ error: "Failed to generate PDF." }, { status: 500 });
  }
}
