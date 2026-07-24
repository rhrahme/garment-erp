import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import { ensurePatternLibraryLoaded, getBasePatternByIdFresh } from "@/lib/data/pattern-library";
import { generateBaseSizeSheetPdf } from "@/lib/pattern-library/generate-base-size-sheet-pdf";

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

    const pdfBytes = await generateBaseSizeSheetPdf(base, size);
    const safeSize = size.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const filename = `${base.id}-size-${safeSize}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
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
