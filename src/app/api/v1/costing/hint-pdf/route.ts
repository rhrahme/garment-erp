import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations";
import { costHintWorksheetFilename } from "@/lib/costing/cost-hint-worksheet";
import { parseCostHintWorksheetSearch } from "@/lib/costing/cost-hint-worksheet-query";
import { generateCostHintWorksheetPdf } from "@/lib/costing/generate-cost-hint-worksheet-pdf";
import { loadCostHintWorksheet } from "@/lib/costing/load-cost-hint-worksheet";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { contentDisposition } from "@/lib/pdf/download-filename";

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

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
      return NextResponse.json({ error: "Invoice not found.", source: "api" }, { status: 404 });
    }
    const pdfBytes = await generateCostHintWorksheetPdf(worksheet);
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition(costHintWorksheetFilename(worksheet), "attachment"),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate cost hint PDF.";
    return NextResponse.json({ error: message, source: "api" }, { status: 500 });
  }
}
