import { NextResponse } from "next/server";
import { buildZipBuffer } from "@/lib/utils/create-zip";
import {
  CALIBRATION_PAGES,
  generateCalibrationStickerPngs,
  generateStickerRollPngs,
  generateStickerRollPngZip,
  generateTestStickerPngs,
} from "@/lib/production/generate-sticker-pdf";
import { parseLabelRotation, parseLabelScalePct } from "@/lib/production/label-printer-settings";
import { filterEntriesByStickerCodes } from "@/lib/production/sticker-print-selection";
import { loadStickerPdfEntries, type StickerSheetKind } from "@/lib/production/sticker-sheet-data";

function parseSheetParam(value: string | null): StickerSheetKind | "test" | "calibration" {
  if (value === "fabric-cuts") return "fabric-cuts";
  if (value === "print-pack") return "print-pack";
  if (value === "test") return "test";
  if (value === "calibration") return "calibration";
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

type PngQuery = {
  sheet: StickerSheetKind | "test" | "calibration";
  poNumber: string | null;
  poId: string | null;
  codes: string[] | null;
  rotationDeg: ReturnType<typeof parseLabelRotation>;
  scalePct: ReturnType<typeof parseLabelScalePct>;
};

function queryFromUrl(url: URL): PngQuery {
  return {
    sheet: parseSheetParam(url.searchParams.get("sheet")),
    poNumber: url.searchParams.get("po"),
    poId: url.searchParams.get("po_id"),
    codes: parseCodesParam(url.searchParams.get("codes")),
    rotationDeg: parseLabelRotation(url.searchParams.get("rotation")),
    scalePct: parseLabelScalePct(url.searchParams.get("scale")),
  };
}

async function zipPngs(
  pngs: Buffer[],
  nameFn: (index: number) => string,
  zipFilename: string
): Promise<NextResponse> {
  const zipBytes = buildZipBuffer(
    pngs.map((png, index) => ({ name: nameFn(index), data: png }))
  );
  return new NextResponse(Buffer.from(zipBytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipFilename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function singlePngResponse(png: Buffer, filename: string): NextResponse {
  return new NextResponse(Buffer.from(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

async function generatePngResponse(orderId: string, query: PngQuery) {
  const { sheet, poNumber, poId, codes, rotationDeg, scalePct } = query;
  const pdfOptions = { rotationDeg, scalePct };

  if (sheet === "calibration") {
    const pngs = await generateCalibrationStickerPngs();
    if (pngs.length === 1) {
      const letter = CALIBRATION_PAGES[0]?.letter ?? "A";
      return singlePngResponse(pngs[0]!, `sticker-calibration-${letter}.png`);
    }
    return zipPngs(
      pngs,
      (index) => `sticker-calibration-${CALIBRATION_PAGES[index]?.letter ?? index + 1}.png`,
      "sticker-calibration.zip"
    );
  }

  if (sheet === "test") {
    const pngs = await generateTestStickerPngs(pdfOptions);
    if (pngs.length === 1) {
      return singlePngResponse(pngs[0]!, "sticker-test-1.png");
    }
    return zipPngs(pngs, (index) => `sticker-test-${index + 1}.png`, "sticker-test.zip");
  }

  const loaded = await loadStickerPdfEntries(orderId, { sheet, poNumber, poId });
  if (!loaded) {
    return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
  }

  const entries = filterEntriesByStickerCodes(loaded.entries, codes);
  if (entries.length === 0) {
    return NextResponse.json({ error: "No sticker labels to print." }, { status: 400 });
  }

  const suffix = sheet === "print-pack" ? "print-pack" : sheet === "fabric-cuts" ? "prep" : "prod";
  const pngs = await generateStickerRollPngs(entries, pdfOptions);

  if (pngs.length === 1) {
    return singlePngResponse(pngs[0]!, `${loaded.order.so_number}-sticker-${suffix}.png`);
  }

  const zipBytes = await generateStickerRollPngZip(
    entries,
    pdfOptions,
    `${loaded.order.so_number}-sticker-${suffix}`
  );
  return new NextResponse(Buffer.from(zipBytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${loaded.order.so_number}-stickers-${suffix}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { requireAuthenticated } = await import("@/lib/auth/session");
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await params;
    return await generatePngResponse(id, queryFromUrl(new URL(request.url)));
  } catch (error) {
    console.error("Failed to generate sticker PNG:", error);
    return NextResponse.json({ error: "Failed to generate sticker PNG." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { requireAuthenticated } = await import("@/lib/auth/session");
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
      scale?: string | number | null;
    };

    const query: PngQuery = {
      sheet: parseSheetParam(body.sheet ?? null),
      poNumber: body.po?.trim() || null,
      poId: body.po_id?.trim() || null,
      codes: parseCodesFromBody(body),
      rotationDeg: parseLabelRotation(body.rotation),
      scalePct: parseLabelScalePct(body.scale),
    };

    return await generatePngResponse(id, query);
  } catch (error) {
    console.error("Failed to generate sticker PNG:", error);
    return NextResponse.json({ error: "Failed to generate sticker PNG." }, { status: 500 });
  }
}
