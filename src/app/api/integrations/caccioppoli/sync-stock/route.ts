import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import {
  caccioppoliFabricNumbersFromOpenOrders,
  syncCaccioppoliCatalogStock,
} from "@/lib/integrations/caccioppoli/sync-catalog-stock";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json().catch(() => ({}))) as {
      scope?: "open_orders" | "catalog";
    };

    const scope = body.scope === "catalog" ? "catalog" : "open_orders";
    const fabric_numbers = scope === "open_orders" ? caccioppoliFabricNumbersFromOpenOrders() : undefined;

    const result = await syncCaccioppoliCatalogStock({
      fabric_numbers,
      mode: scope === "open_orders" ? "lookup" : "availability_all",
    });

    return NextResponse.json({
      scope,
      fabric_numbers: fabric_numbers ?? null,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Caccioppoli stock sync failed.";
    const status = message.toLowerCase().includes("admin") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
