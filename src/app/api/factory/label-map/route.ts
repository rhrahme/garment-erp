import { NextRequest, NextResponse } from "next/server";
import {
  generateLabelMapPdf,
  type LabelMapLayout,
} from "@/lib/production/generate-label-map-pdf";

function parseLayout(value: string | null): LabelMapLayout {
  if (value === "pairs") return "pairs";
  return "all";
}

export async function GET(request: NextRequest) {
  try {
    const layout = parseLayout(request.nextUrl.searchParams.get("layout"));
    const pdfBytes = generateLabelMapPdf(layout);
    const filename =
      layout === "pairs" ? "factory-label-map-pairs.pdf" : "factory-label-map.pdf";

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate label map PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
