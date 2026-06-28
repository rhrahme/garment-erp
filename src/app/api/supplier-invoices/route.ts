import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { computeCustomsSummary } from "@/lib/integrations/customs-summary";
import { enrichAllInvoiceAmounts } from "@/lib/integrations/invoice-enrichment";
import { listSupplierInvoices } from "@/lib/integrations/supplier-invoice-store";
import {
  attachTransporterInvoicesToSuppliers,
  relinkTransporterInvoicesByAwb,
} from "@/lib/integrations/transporter-invoice-store";

export async function GET(request: Request) {
  try {
    await ensureDocumentsLoaded(["supplier_invoices", "transporter_invoices"]);

    const { searchParams } = new URL(request.url);
    if (searchParams.get("enrich") === "1") {
      await enrichAllInvoiceAmounts();
    }

    relinkTransporterInvoicesByAwb();

    const invoices = attachTransporterInvoicesToSuppliers(listSupplierInvoices()).map((invoice) => ({
      ...invoice,
      customs_summary: computeCustomsSummary(invoice.awb_numbers, invoice.transporter_invoices),
    }));

    return NextResponse.json({ invoices });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load supplier invoices.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
