import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import { generatePatternSheetPdf } from "@/lib/pattern-library/generate-pattern-sheet-pdf";
import { buildPatternSheetData } from "@/lib/pattern-library/sheet-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ patternId: string }> }) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }

    const { patternId } = await context.params;
    const url = new URL(request.url);
    const data = await buildPatternSheetData(patternId, {
      versionId: url.searchParams.get("version"),
      jobId: url.searchParams.get("job"),
    });
    if (!data) {
      return NextResponse.json({ error: "Client pattern not found." }, { status: 404 });
    }

    const pdfBytes = await generatePatternSheetPdf(data);
    const filename = `${data.pattern.pattern_ref.toLowerCase()}-trial-${data.version.version}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to generate pattern sheet PDF:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate PDF." },
      { status: 500 }
    );
  }
}
