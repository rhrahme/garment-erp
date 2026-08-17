import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { openInventoryCarton } from "@/lib/data/inventory-store";
import { notifyIntegration } from "@/lib/integrations";

/** Scan-open a carton: idempotent - a rescan reports already_opened. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireAuthenticated();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  await ensureDocumentsLoaded(["inventory_store"]);

  const { id } = await context.params;
  try {
    const { carton, item, opened } = await openInventoryCarton(id, session.email);
    if (opened) {
      await notifyIntegration("inventory.carton_opened", {
        carton_id: carton.id,
        item_id: item.id,
        name: item.name,
        quantity: carton.quantity,
        balance_after: item.quantity_on_hand,
        by: session.email,
      }).catch(() => {});
    }
    return NextResponse.json({ carton, item, opened });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to open the carton." },
      { status: 400 }
    );
  }
}
