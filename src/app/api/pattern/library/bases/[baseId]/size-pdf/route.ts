import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import { ensurePatternLibraryLoaded, getBasePatternByIdFresh } from "@/lib/data/pattern-library";
import { generateBaseSizeSheetPdf } from "@/lib/pattern-library/generate-base-size-sheet-pdf";
import { buildBaseSizeSheetPdfFilename, contentDisposition } from "@/lib/pdf/download-filename";

export const dynamic = "force-dynamic";

/** Read-only per-size working-sheet PDF (no write path — no Zapier parity needed). */
export async function GET(request: Request, context: { params: Promise<{ baseId: string }> }) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }

    const { baseId } = await context.params;
    const url = new URL(request.url);
    const size = url.searchParams.get("size")?.trim();
    if (!size) {
      return NextResponse.json({ error: "size query parameter is required." }, { status: 400 });
    }

    await ensurePatternLibraryLoaded();
    const base = await getBasePatternByIdFresh(baseId);
    if (!base) {
      return NextResponse.json({ error: "Base pattern not found." }, { status: 404 });
    }
    if (!base.sizes.includes(size)) {
      return NextResponse.json(
        { error: `Size ${size} is not on base pattern ${base.name}.` },
        { status: 404 }
      );
    }

    // ?client= includes the client's fit column next to the base size values.
    const clientId = url.searchParams.get("client")?.trim();
    const clientColumn = clientId
      ? base.client_columns?.find((column) => column.client_id === clientId) ?? null
      : null;

    const pdfBytes = await generateBaseSizeSheetPdf(base, size, clientColumn);
    const filename = buildBaseSizeSheetPdfFilename(base, size);

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition(filename),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to generate base size sheet PDF:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate PDF." },
      { status: 500 }
    );
  }
}
