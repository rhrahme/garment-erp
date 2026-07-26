import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { resolveDrapersSwatchUrlsBatch } from "@/lib/fabric-sourcing/resolve-drapers-swatch-urls.server";

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("codes") ?? searchParams.get("fabric");
    const codes = (raw ? raw.split(/[,\s]+/) : [])
      .map((code) => code.trim())
      .filter(Boolean)
      .slice(0, 60);

    const items = await resolveDrapersSwatchUrlsBatch(codes);

    return NextResponse.json({ codes, items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Drapers swatch images.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
