import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { adjustInventoryQuantity, readInventoryStoreFresh } from "@/lib/data/inventory-store";
import { notifyIntegration } from "@/lib/integrations";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import type { InventoryLedgerReason } from "@/lib/types/inventory";

const MANUAL_REASONS: InventoryLedgerReason[] = ["received", "manual_adjust", "correction"];

/** Zapier parity: adjust stock by item id or exact item name. */
export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  await ensureDocumentsLoaded(["inventory_store"]);

  let body: {
    item_id?: string;
    item_name?: string;
    delta?: number;
    reason?: string;
    note?: string | null;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let itemId = String(body.item_id ?? "").trim();
  if (!itemId && body.item_name) {
    const store = await readInventoryStoreFresh();
    const wanted = String(body.item_name).trim().toLowerCase();
    itemId = store.items.find((item) => item.name.trim().toLowerCase() === wanted)?.id ?? "";
  }
  if (!itemId) return NextResponse.json({ error: "item_id or item_name is required." }, { status: 400 });

  const reason = (body.reason ?? "manual_adjust") as InventoryLedgerReason;
  if (!MANUAL_REASONS.includes(reason)) {
    return NextResponse.json({ error: "Invalid reason." }, { status: 400 });
  }

  try {
    const { item, entry } = await adjustInventoryQuantity(itemId, Number(body.delta), reason, {
      note: body.note ?? null,
      actedBy: "api",
    });
    await notifyIntegration("inventory.stock_adjusted", {
      item_id: item.id,
      name: item.name,
      delta: entry.delta,
      balance_after: entry.balance_after,
      reason: entry.reason,
      by: "api",
    }).catch(() => {});
    return NextResponse.json({ item, entry });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to adjust stock." },
      { status: 400 }
    );
  }
}
