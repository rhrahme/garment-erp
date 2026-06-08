import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import {
  generateStickerRollPdf,
  generateTestStickerPdf,
} from "@/lib/production/generate-sticker-pdf";
import { loadStickerPdfEntries } from "@/lib/production/sticker-sheet-data";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await params;
    const url = new URL(request.url);
    const sheetParam = url.searchParams.get("sheet");
    const sheet =
      sheetParam === "fabric-cuts"
        ? "fabric-cuts"
        : sheetParam === "print-pack"
          ? "print-pack"
          : sheetParam === "test"
            ? "test"
            : "pieces";

    if (sheet === "test") {
      const pdfBytes = await generateTestStickerPdf();
      return new NextResponse(Buffer.from(pdfBytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="sticker-test.pdf"',
          "Cache-Control": "no-store",
        },
      });
    }

    const loaded = await loadStickerPdfEntries(id, {
      sheet,
      poNumber: url.searchParams.get("po"),
      poId: url.searchParams.get("po_id"),
    });

    if (!loaded) {
      return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    }

    if (loaded.entries.length === 0) {
      return NextResponse.json({ error: "No sticker labels to print." }, { status: 400 });
    }

    const pdfBytes = await generateStickerRollPdf(loaded.entries);
    const suffix =
      sheet === "print-pack" ? "print-pack" : sheet === "fabric-cuts" ? "prep" : "prod";

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${loaded.order.so_number}-stickers-${suffix}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to generate sticker PDF:", error);
    return NextResponse.json({ error: "Failed to generate sticker PDF." }, { status: 500 });
  }
}
