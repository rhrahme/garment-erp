import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readInventoryStoreFresh, upsertInventoryItem } from "@/lib/data/inventory-store";
import { notifyIntegration } from "@/lib/integrations";

export async function GET() {
  const session = await requireAuthenticated();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  await ensureDocumentsLoaded(["inventory_store"]);
  const store = await readInventoryStoreFresh();
  return NextResponse.json({
    items: store.items,
    recipes: store.recipes,
    cartons: store.cartons,
  });
}

export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  await ensureDocumentsLoaded(["inventory_store"]);

  let body: {
    id?: string | null;
    name?: string;
    category?: string | null;
    brand?: string | null;
    unit?: string | null;
    low_stock_threshold?: number | null;
    location?: string | null;
    notes?: string | null;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Item name is required." }, { status: 400 });

  try {
    const isUpdate = Boolean(body.id);
    const item = await upsertInventoryItem(
      {
        id: body.id ?? null,
        name,
        category: body.category ?? null,
        brand: body.brand ?? null,
        unit: body.unit ?? null,
        low_stock_threshold:
          body.low_stock_threshold == null ? null : Number(body.low_stock_threshold),
        location: body.location ?? null,
        notes: body.notes ?? null,
      },
      session.email
    );
    await notifyIntegration(isUpdate ? "inventory.item_updated" : "inventory.item_created", {
      item_id: item.id,
      name: item.name,
      unit: item.unit,
      quantity_on_hand: item.quantity_on_hand,
      by: session.email,
    }).catch(() => {});
    return NextResponse.json({ item }, { status: isUpdate ? 200 : 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save the item." },
      { status: 400 }
    );
  }
}
