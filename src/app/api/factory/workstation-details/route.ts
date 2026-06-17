import { NextRequest, NextResponse } from "next/server";
import {
  generateWorkstationDetailPdf,
  type WorkstationDetailLayout,
} from "@/lib/production/generate-workstation-detail-pdf";

function parseLayout(value: string | null): WorkstationDetailLayout {
  if (value === "all") return "all";
  return "pairs";
}

export async function GET(request: NextRequest) {
  try {
    const layout = parseLayout(request.nextUrl.searchParams.get("layout"));
    const pdfBytes = generateWorkstationDetailPdf(layout);
    const filename =
      layout === "all"
        ? "factory-workstation-details-all.pdf"
        : "factory-workstation-details-pairs.pdf";

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate workstation details PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
