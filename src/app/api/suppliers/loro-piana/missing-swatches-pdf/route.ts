import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import {
  generateLoroPianaMissingSwatchesPdf,
  LORO_PIANA_MISSING_SWATCHES_PDF_FILENAME,
} from "@/lib/fabric-sourcing/generate-loro-piana-missing-swatches-pdf";

export async function GET() {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const pdfBytes = generateLoroPianaMissingSwatchesPdf();

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${LORO_PIANA_MISSING_SWATCHES_PDF_FILENAME}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate missing swatches PDF.";
    console.error("Failed to generate Loro Piana missing swatches PDF:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
