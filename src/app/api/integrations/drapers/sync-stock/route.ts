import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import {
  drapersFabricNumbersFromOpenOrders,
  syncDrapersCatalogStock,
} from "@/lib/integrations/drapers/sync-catalog-stock";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json().catch(() => ({}))) as {
      scope?: "open_orders" | "catalog";
      limit?: number;
    };

    const scope = body.scope === "catalog" ? "catalog" : "open_orders";
    const fabric_numbers = scope === "open_orders" ? drapersFabricNumbersFromOpenOrders() : undefined;

    const result = await syncDrapersCatalogStock({
      fabric_numbers,
      mode: scope === "open_orders" ? "lookup" : "api_pages",
      page_limit: typeof body.page_limit === "number" ? body.page_limit : 200,
    });

    return NextResponse.json({
      scope,
      fabric_numbers: fabric_numbers ?? null,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Drapers stock sync failed.";
    const status = message.toLowerCase().includes("admin") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
