import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  buildSingleSupplierInvoiceExportZip,
  buildSupplierInvoicesExportZip,
  exportZipFilename,
} from "@/lib/integrations/export-supplier-invoices-zip";

export async function GET(request: Request) {
  try {
    await ensureDocumentsLoaded(["supplier_invoices", "transporter_invoices"]);

    const { searchParams } = new URL(request.url);
    const invoiceId = searchParams.get("id")?.trim();

    const zip = invoiceId
      ? await buildSingleSupplierInvoiceExportZip(invoiceId)
      : await buildSupplierInvoicesExportZip();

    if (!zip) {
      return NextResponse.json({ error: "Supplier invoice not found." }, { status: 404 });
    }

    const filename = invoiceId
      ? exportZipFilename(`supplier-invoice-${invoiceId}`)
      : exportZipFilename();

    return new NextResponse(zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(zip.length),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to export supplier invoices.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
