import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { setInventoryLowStockAlert } from "@/lib/data/inventory-store";
import { notifyIntegration } from "@/lib/integrations";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { inventoryItemIsLow } from "@/lib/types/inventory";

/** Zapier parity: set or clear a low-stock alert. */
export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  await ensureDocumentsLoaded(["inventory_store"]);

  let body: { item_id?: string; low_stock_threshold?: number | string | null } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const item = await setInventoryLowStockAlert(
      String(body.item_id ?? "").trim(),
      body.low_stock_threshold,
      "api"
    );
    await notifyIntegration("inventory.item_updated", {
      item_id: item.id,
      name: item.name,
      unit: item.unit,
      quantity_on_hand: item.quantity_on_hand,
      low_stock_threshold: item.low_stock_threshold,
      by: "api",
    }).catch(() => {});
    if (inventoryItemIsLow(item)) {
      await notifyIntegration("inventory.low_stock", {
        item_id: item.id,
        name: item.name,
        quantity_on_hand: item.quantity_on_hand,
        low_stock_threshold: item.low_stock_threshold,
        by: "api",
      }).catch(() => {});
    }
    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to set the alert." },
      { status: 400 }
    );
  }
}
