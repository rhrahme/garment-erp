import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { lookupCaccioppoliItemImages } from "@/lib/integrations/caccioppoli/client";
import { isCaccioppoliApiConfigured } from "@/lib/integrations/caccioppoli/config";

const DEFAULT_PREVIEW_CODES = ["360102", "360101", "206107"];

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (!isCaccioppoliApiConfigured()) {
      return NextResponse.json({ error: "CACCIOPPOLI_API_TOKEN is not configured." }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("codes") ?? searchParams.get("fabric");
    const codes = (raw ? raw.split(/[,\s]+/) : DEFAULT_PREVIEW_CODES)
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, 10);

    const items = await Promise.all(
      codes.map(async (requested_code) => {
        const result = await lookupCaccioppoliItemImages(requested_code);
        return {
          ...result,
          requested_code,
          medias: result.ok ? { square: result.square, zoom: result.zoom } : undefined,
        };
      })
    );

    return NextResponse.json({ codes, items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Caccioppoli swatch images.";
    const status = message.toLowerCase().includes("admin") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
