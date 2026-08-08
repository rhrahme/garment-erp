import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import { parseMeasurementUnit } from "@/lib/pattern-library/measurement-unit-preference";
import { generatePatternSheetPdf } from "@/lib/pattern-library/generate-pattern-sheet-pdf";
import {
  parsePatternSheetKind,
  parsePatternSheetLineIds,
} from "@/lib/pattern-library/pattern-sheet-kind";
import { buildPatternSheetPdfFilename } from "@/lib/pattern-library/pattern-sheet-pdf-filename";
import { contentDisposition } from "@/lib/pdf/download-filename";
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
    const kind = parsePatternSheetKind(url.searchParams.get("sheet"));
    const lineIds = parsePatternSheetLineIds(url.searchParams.get("lines"));
    const displayUnit = parseMeasurementUnit(url.searchParams.get("unit")) ?? undefined;
    const data = await buildPatternSheetData(patternId, {
      versionId: url.searchParams.get("version"),
      jobId: url.searchParams.get("job"),
      lineId: url.searchParams.get("line"),
      lineIds: kind === "sewing" ? (lineIds && lineIds.length > 0 ? lineIds : null) : null,
    });
    if (!data) {
      return NextResponse.json({ error: "Client pattern not found." }, { status: 404 });
    }

    const pdfBytes = await generatePatternSheetPdf(data, kind, { displayUnit });
    const filename = buildPatternSheetPdfFilename(data, kind);

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition(filename),
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
