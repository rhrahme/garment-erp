import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { openInventoryCarton } from "@/lib/data/inventory-store";
import { parseInventoryBoxScan } from "@/lib/inventory/box-scan";
import { notifyIntegration } from "@/lib/integrations";

/** Floor scan of a box sticker. Same result as opening /inventory/cartons/[id]. */
export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  await ensureDocumentsLoaded(["inventory_store"]);

  let body: { scan_input?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const boxId = parseInventoryBoxScan(body.scan_input);
  if (!boxId) {
    return NextResponse.json({ error: "Scan the box sticker QR." }, { status: 400 });
  }

  try {
    const { carton, item, opened } = await openInventoryCarton(boxId, session.email);
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
      { error: error instanceof Error ? error.message : "Failed to open the box." },
      { status: 400 }
    );
  }
}
