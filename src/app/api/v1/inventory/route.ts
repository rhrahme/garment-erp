import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readInventoryStoreFresh } from "@/lib/data/inventory-store";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { inventoryItemIsLow } from "@/lib/types/inventory";

/** Zapier parity: list inventory items (+ recipes and recent ledger). */
export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  await ensureDocumentsLoaded(["inventory_store"]);

  const store = await readInventoryStoreFresh();
  const url = new URL(request.url);
  const lowOnly = url.searchParams.get("low_stock") === "true";
  const items = lowOnly ? store.items.filter(inventoryItemIsLow) : store.items;

  return NextResponse.json({
    items,
    recipes: store.recipes,
    ledger: store.ledger.slice(-100),
    cartons: store.cartons,
  });
}
