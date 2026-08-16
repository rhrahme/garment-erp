import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { adjustInventoryQuantity } from "@/lib/data/inventory-store";
import { inventoryItemIsLow, type InventoryLedgerReason } from "@/lib/types/inventory";
import { notifyIntegration } from "@/lib/integrations";

const MANUAL_REASONS: InventoryLedgerReason[] = ["received", "manual_adjust", "correction"];

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireAuthenticated();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  await ensureDocumentsLoaded(["inventory_store"]);

  const { id } = await context.params;
  let body: { delta?: number; reason?: string; note?: string | null } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const delta = Number(body.delta);
  const reason = (body.reason ?? "manual_adjust") as InventoryLedgerReason;
  if (!MANUAL_REASONS.includes(reason)) {
    return NextResponse.json({ error: "Invalid reason." }, { status: 400 });
  }

  try {
    const { item, entry } = await adjustInventoryQuantity(id, delta, reason, {
      note: body.note ?? null,
      actedBy: session.email,
    });
    await notifyIntegration("inventory.stock_adjusted", {
      item_id: item.id,
      name: item.name,
      delta: entry.delta,
      balance_after: entry.balance_after,
      reason: entry.reason,
      by: session.email,
    }).catch(() => {});
    if (entry.delta < 0 && inventoryItemIsLow(item)) {
      await notifyIntegration("inventory.low_stock", {
        item_id: item.id,
        name: item.name,
        quantity_on_hand: item.quantity_on_hand,
        low_stock_threshold: item.low_stock_threshold,
      }).catch(() => {});
    }
    return NextResponse.json({ item, entry });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to adjust stock." },
      { status: 400 }
    );
  }
}
