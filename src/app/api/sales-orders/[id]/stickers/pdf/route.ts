import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import {
  generateStickerRollPdf,
  generateTestStickerPdf,
} from "@/lib/production/generate-sticker-pdf";
import { parseLabelRotation } from "@/lib/production/label-printer-settings";
import { filterEntriesByStickerCodes } from "@/lib/production/sticker-print-selection";
import { loadStickerPdfEntries, type StickerSheetKind } from "@/lib/production/sticker-sheet-data";

function parseSheetParam(value: string | null): StickerSheetKind | "test" {
  if (value === "fabric-cuts") return "fabric-cuts";
  if (value === "print-pack") return "print-pack";
  if (value === "test") return "test";
  return "pieces";
}

function parseCodesParam(raw: string | null): string[] | null {
  if (!raw?.trim()) return null;
  const codes = raw
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);
  return codes.length > 0 ? codes : null;
}

function parseCodesFromBody(body: unknown): string[] | null {
  if (!body || typeof body !== "object") return null;
  const codes = (body as { codes?: unknown }).codes;
  if (!Array.isArray(codes)) return null;
  const parsed = codes.map((code) => String(code).trim()).filter(Boolean);
  return parsed.length > 0 ? parsed : null;
}

type PdfQuery = {
  sheet: StickerSheetKind | "test";
  poNumber: string | null;
  poId: string | null;
  codes: string[] | null;
  rotationDeg: ReturnType<typeof parseLabelRotation>;
};

function queryFromUrl(url: URL): PdfQuery {
  return {
    sheet: parseSheetParam(url.searchParams.get("sheet")),
    poNumber: url.searchParams.get("po"),
    poId: url.searchParams.get("po_id"),
    codes: parseCodesParam(url.searchParams.get("codes")),
    rotationDeg: parseLabelRotation(url.searchParams.get("rotation")),
  };
}

async function generatePdfResponse(orderId: string, query: PdfQuery) {
  const { sheet, poNumber, poId, codes, rotationDeg } = query;
  const pdfOptions = { rotationDeg };

  if (sheet === "test") {
    const pdfBytes = await generateTestStickerPdf(pdfOptions);
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="sticker-test.pdf"',
        "Cache-Control": "no-store",
      },
    });
  }

  const loaded = await loadStickerPdfEntries(orderId, { sheet, poNumber, poId });
  if (!loaded) {
    return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
  }

  const entries = filterEntriesByStickerCodes(loaded.entries, codes);
  if (entries.length === 0) {
    return NextResponse.json({ error: "No sticker labels to print." }, { status: 400 });
  }

  const pdfBytes = await generateStickerRollPdf(entries, pdfOptions);
  const suffix = sheet === "print-pack" ? "print-pack" : sheet === "fabric-cuts" ? "prep" : "prod";

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${loaded.order.so_number}-stickers-${suffix}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await params;
    return await generatePdfResponse(id, queryFromUrl(new URL(request.url)));
  } catch (error) {
    console.error("Failed to generate sticker PDF:", error);
    return NextResponse.json({ error: "Failed to generate sticker PDF." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await params;
    const body = (await request.json()) as {
      sheet?: string;
      po?: string | null;
      po_id?: string | null;
      codes?: string[];
      rotation?: string | number | null;
    };

    const query: PdfQuery = {
      sheet: parseSheetParam(body.sheet ?? null),
      poNumber: body.po?.trim() || null,
      poId: body.po_id?.trim() || null,
      codes: parseCodesFromBody(body),
      rotationDeg: parseLabelRotation(body.rotation),
    };

    return await generatePdfResponse(id, query);
  } catch (error) {
    console.error("Failed to generate sticker PDF:", error);
    return NextResponse.json({ error: "Failed to generate sticker PDF." }, { status: 500 });
  }
}
