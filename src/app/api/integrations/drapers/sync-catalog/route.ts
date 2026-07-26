import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import {
  drapersFabricNumbersFromOpenOrders,
  syncDrapersCatalogFromApi,
} from "@/lib/integrations/drapers/sync-catalog-enrichment";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json().catch(() => ({}))) as {
      scope?: "open_orders" | "catalog";
      enrich_details?: boolean;
      fabric_numbers?: string[];
      delay_ms?: number;
      page_limit?: number;
    };

    const scope = body.scope === "catalog" ? "catalog" : "open_orders";
    const fabric_numbers =
      body.fabric_numbers?.length
        ? body.fabric_numbers
        : scope === "open_orders"
          ? drapersFabricNumbersFromOpenOrders()
          : undefined;

    const result = await syncDrapersCatalogFromApi({
      fabric_numbers,
      enrich_details: body.enrich_details ?? Boolean(fabric_numbers?.length),
      delay_ms: typeof body.delay_ms === "number" ? body.delay_ms : 150,
      page_limit: typeof body.page_limit === "number" ? body.page_limit : 500,
    });

    return NextResponse.json({
      scope,
      fabric_numbers: fabric_numbers ?? null,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Drapers catalog sync failed.";
    const status = message.toLowerCase().includes("admin") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
