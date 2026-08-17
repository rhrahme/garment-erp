import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { createInventoryCartons } from "@/lib/data/inventory-store";
import { notifyIntegration } from "@/lib/integrations";

/** Register a received delivery as sealed cartons with printable QR stickers. */
export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  await ensureDocumentsLoaded(["inventory_store"]);

  let body: { item_id?: string; carton_count?: number; quantity_per_carton?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const { item, cartons } = await createInventoryCartons(
      String(body.item_id ?? "").trim(),
      Number(body.carton_count),
      Number(body.quantity_per_carton),
      session.email
    );
    await notifyIntegration("inventory.cartons_created", {
      item_id: item.id,
      name: item.name,
      carton_count: cartons.length,
      quantity_per_carton: cartons[0]?.quantity ?? 0,
      carton_ids: cartons.map((carton) => carton.id),
      by: session.email,
    }).catch(() => {});
    return NextResponse.json({ item, cartons }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to register cartons." },
      { status: 400 }
    );
  }
}
