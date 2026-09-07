import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { canViewMoney } from "@/lib/auth/invoice-amounts-access";
import { costHintWorksheetFilename } from "@/lib/costing/cost-hint-worksheet";
import { parseCostHintWorksheetSearch } from "@/lib/costing/cost-hint-worksheet-query";
import { generateCostHintWorksheetPdf } from "@/lib/costing/generate-cost-hint-worksheet-pdf";
import { loadCostHintWorksheet } from "@/lib/costing/load-cost-hint-worksheet";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { contentDisposition } from "@/lib/pdf/download-filename";

export async function GET(request: Request) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!canViewMoney(session)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    await ensureDocumentsLoaded(["sales_orders", "costing_rates", "customer_invoices", "clients"]);
    const url = new URL(request.url);
    const worksheet = loadCostHintWorksheet(
      parseCostHintWorksheetSearch({
        invoice: url.searchParams.get("invoice") ?? undefined,
        so: url.searchParams.get("so") ?? undefined,
        brand: url.searchParams.get("brand") ?? undefined,
        archived: url.searchParams.get("archived") ?? undefined,
      })
    );
    if (!worksheet) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }
    const pdfBytes = await generateCostHintWorksheetPdf(worksheet);
    const disposition = url.searchParams.get("disposition") === "inline" ? "inline" : "attachment";
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition(costHintWorksheetFilename(worksheet), disposition),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to generate cost hint PDF:", error);
    return NextResponse.json({ error: "Failed to generate cost hint PDF." }, { status: 500 });
  }
}
