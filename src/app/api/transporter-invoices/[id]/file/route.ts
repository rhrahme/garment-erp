import fs from "fs";
import { NextResponse } from "next/server";
import {
  getTransporterInvoice,
  getTransporterInvoiceFilePath,
} from "@/lib/integrations/transporter-invoice-store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const invoice = getTransporterInvoice(id);
    if (!invoice) {
      return NextResponse.json({ error: "Transporter invoice not found." }, { status: 404 });
    }

    const filePath = getTransporterInvoiceFilePath(invoice);
    if (!filePath || !fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Transporter invoice file missing on disk." }, { status: 404 });
    }

    const content = fs.readFileSync(filePath);
    const filename = invoice.original_filename ?? "transporter-invoice.pdf";
    return new NextResponse(content, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(content.length),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to open transporter invoice.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
