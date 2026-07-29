import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { lookupCaccioppoliSwatches } from "@/lib/fabric-sourcing/caccioppoli-swatches";

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

    const items = lookupCaccioppoliSwatches(codes).map((item) => ({
      ...item,
      square: item.url,
      zoom: item.url,
    }));

    return NextResponse.json({ codes, items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Caccioppoli swatch images.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
