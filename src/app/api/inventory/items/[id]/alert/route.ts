import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { setInventoryLowStockAlert } from "@/lib/data/inventory-store";
import { notifyIntegration } from "@/lib/integrations";
import { inventoryItemIsLow } from "@/lib/types/inventory";

/** Set or clear the low-stock alert on one item. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireAuthenticated();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  await ensureDocumentsLoaded(["inventory_store"]);

  let body: { low_stock_threshold?: number | string | null } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const item = await setInventoryLowStockAlert(id, body.low_stock_threshold, session.email);
    await notifyIntegration("inventory.item_updated", {
      item_id: item.id,
      name: item.name,
      unit: item.unit,
      quantity_on_hand: item.quantity_on_hand,
      low_stock_threshold: item.low_stock_threshold,
      by: session.email,
    }).catch(() => {});
    if (inventoryItemIsLow(item)) {
      await notifyIntegration("inventory.low_stock", {
        item_id: item.id,
        name: item.name,
        quantity_on_hand: item.quantity_on_hand,
        low_stock_threshold: item.low_stock_threshold,
        by: session.email,
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
