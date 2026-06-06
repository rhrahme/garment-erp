import { type NextRequest, NextResponse } from "next/server";

/** Same-origin QR PNG so thermal printers receive an embedded image, not a blocked remote URL. */
export async function GET(request: NextRequest) {
  const data = request.nextUrl.searchParams.get("data")?.trim();
  if (!data) {
    return NextResponse.json({ error: "Missing data parameter." }, { status: 400 });
  }

  const size = Math.min(512, Math.max(64, Number(request.nextUrl.searchParams.get("size") ?? 120) || 120));
  const upstream = new URL("https://api.qrserver.com/v1/create-qr-code/");
  upstream.searchParams.set("size", `${size}x${size}`);
  upstream.searchParams.set("margin", "0");
  upstream.searchParams.set("data", data);

  try {
    const res = await fetch(upstream, { next: { revalidate: 86400 } });
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to generate QR code." }, { status: 502 });
    }
    const bytes = await res.arrayBuffer();
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to generate QR code." }, { status: 502 });
  }
}
