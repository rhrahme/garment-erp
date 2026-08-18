import { NextResponse } from "next/server";
import { canViewMoney } from "@/lib/auth/invoice-amounts-access";
import { supplierInvoiceForSession } from "@/lib/auth/supplier-invoice-money";
import { requireAuthenticated } from "@/lib/auth/session";
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
    const session = await requireAuthenticated();
    if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    await ensureDocumentsLoaded(["supplier_invoices", "transporter_invoices"]);

    const { searchParams } = new URL(request.url);
    if (searchParams.get("enrich") === "1" && canViewMoney(session)) {
      await enrichAllInvoiceAmounts();
    }

    relinkTransporterInvoicesByAwb();

    const invoices = attachTransporterInvoicesToSuppliers(listSupplierInvoices()).map((invoice) => ({
      ...invoice,
      customs_summary: computeCustomsSummary(invoice.awb_numbers, invoice.transporter_invoices),
    }));

    return NextResponse.json({
      invoices: invoices.map((invoice) => supplierInvoiceForSession(session, invoice)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load supplier invoices.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
