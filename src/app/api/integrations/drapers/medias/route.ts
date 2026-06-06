import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { lookupDrapersFabricMedias } from "@/lib/integrations/drapers/client";
import { isDrapersApiConfigured } from "@/lib/integrations/drapers/config";

const DEFAULT_PREVIEW_CODES = ["10101", "90640", "85119"];

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (!isDrapersApiConfigured()) {
      return NextResponse.json({ error: "DRAPERS_API_KEY is not configured." }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("codes") ?? searchParams.get("fabric");
    const codes = (raw ? raw.split(/[,\s]+/) : DEFAULT_PREVIEW_CODES)
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, 40);

    const items = await Promise.all(
      codes.map(async (requested_code) => {
        const result = await lookupDrapersFabricMedias(requested_code);
        return { ...result, requested_code };
      })
    );

    return NextResponse.json({ codes, items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Drapers fabric medias.";
    const status = message.toLowerCase().includes("admin") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
