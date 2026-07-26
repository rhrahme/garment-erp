import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { lookupDrapersSwatches } from "@/lib/fabric-sourcing/drapers-swatches";
import { getDrapersCatalogSwatchUrls } from "@/lib/integrations/drapers/drapers-catalog-swatches";

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

    const items = lookupDrapersSwatches(codes).map((item) => {
      if (item.ok && item.url) {
        return {
          ...item,
          square: item.url,
          zoom: item.url,
        };
      }

      const cached = getDrapersCatalogSwatchUrls(item.requested_code);
      if (cached?.square) {
        return {
          ...item,
          ok: true,
          square: cached.square,
          zoom: cached.zoom ?? cached.square,
          url: cached.square,
        };
      }

      return item;
    });

    return NextResponse.json({ codes, items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Drapers swatch images.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
