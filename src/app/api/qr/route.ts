import { type NextRequest, NextResponse } from "next/server";
import { renderQrPngBuffer } from "@/lib/production/qr-render";

/**
 * Same-origin QR PNG rendered locally (offline) with CRISP integer-pixel modules and a
 * 4-module quiet zone. Previously this proxied a remote raster (api.qrserver.com) at a
 * fixed size that was not an integer multiple of the module count — every downstream
 * resample fragmented the code on the D550. Local generation is resolution-clean, faster,
 * and removes a network dependency from every label render.
 */
export async function GET(request: NextRequest) {
  const data = request.nextUrl.searchParams.get("data")?.trim();
  if (!data) {
    return NextResponse.json({ error: "Missing data parameter." }, { status: 400 });
  }

  const size = Math.min(
    1024,
    Math.max(64, Number(request.nextUrl.searchParams.get("size") ?? 120) || 120)
  );

  try {
    const { png } = await renderQrPngBuffer(data, size);
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to generate QR code." }, { status: 500 });
  }
}
