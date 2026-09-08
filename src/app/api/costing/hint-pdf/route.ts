import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { canViewMoney } from "@/lib/auth/invoice-amounts-access";
import { costHintDownloadFilename, worksheetForCostHintDownload } from "@/lib/costing/cost-hint-worksheet";
import { parseCostHintWorksheetSearch } from "@/lib/costing/cost-hint-worksheet-query";
import { generateCostHintWorksheetPdf } from "@/lib/costing/generate-cost-hint-worksheet-pdf";
import { loadCostHintClientPack } from "@/lib/costing/load-cost-hint-pack";
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
    const parsed = parseCostHintWorksheetSearch({
      invoice: url.searchParams.get("invoice") ?? undefined,
      so: url.searchParams.get("so") ?? undefined,
      brand: url.searchParams.get("brand") ?? undefined,
      archived: url.searchParams.get("archived") ?? undefined,
      missing: url.searchParams.get("missing") ?? undefined,
      clients: url.searchParams.get("clients") ?? undefined,
    });
    const disposition = url.searchParams.get("disposition") === "inline" ? "inline" : "attachment";

    if (parsed.missingPrices && !parsed.invoiceId) {
      const loaded = loadCostHintWorksheet(parsed);
      const worksheet = loaded ? worksheetForCostHintDownload(loaded, { missingPrices: true }) : null;
      if (!worksheet) {
        return NextResponse.json({ error: "No lines missing fabric price." }, { status: 404 });
      }
      const pdfBytes = await generateCostHintWorksheetPdf(worksheet);
      return new NextResponse(Buffer.from(pdfBytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": contentDisposition(costHintDownloadFilename(worksheet), disposition),
          "Cache-Control": "no-store",
        },
      });
    }

    if (!parsed.invoiceId && parsed.clientTokens.length > 0) {
      const pack = await loadCostHintClientPack(parsed);
      if (!pack) {
        return NextResponse.json({ error: "No cost-hint lines for those clients." }, { status: 404 });
      }
      if (pack.singlePdf && parsed.clientTokens.length === 1) {
        return new NextResponse(new Uint8Array(pack.singlePdf.bytes), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": contentDisposition(pack.singlePdf.filename, disposition),
            "Cache-Control": "no-store",
          },
        });
      }
      return new NextResponse(new Uint8Array(pack.zip), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": contentDisposition(pack.filename, "attachment"),
          "Cache-Control": "no-store",
        },
      });
    }

    const worksheet = loadCostHintWorksheet(parsed);
    if (!worksheet) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }
    const pdfBytes = await generateCostHintWorksheetPdf(worksheet);
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition(costHintDownloadFilename(worksheet), disposition),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to generate cost hint PDF:", error);
    return NextResponse.json({ error: "Failed to generate cost hint PDF." }, { status: 500 });
  }
}
