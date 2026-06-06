import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { syncDrapersCatalogPrices } from "@/lib/integrations/drapers/sync-catalog-prices";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json().catch(() => ({}))) as { page_limit?: number };

    const result = await syncDrapersCatalogPrices({
      page_limit: typeof body.page_limit === "number" ? body.page_limit : 200,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Drapers price sync failed.";
    const status = message.toLowerCase().includes("admin") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
