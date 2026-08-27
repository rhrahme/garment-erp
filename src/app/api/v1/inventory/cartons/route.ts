import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { createInventoryCartons } from "@/lib/data/inventory-store";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { notifyIntegration } from "@/lib/integrations";

/** Zapier parity: register sealed boxes and print QR ids. */
export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  await ensureDocumentsLoaded(["inventory_store"]);

  let body: {
    item_id?: string;
    carton_count?: number;
    quantity_per_carton?: number;
    quantities?: number[];
  } = {};
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
      "api",
      body.quantities
    );
    await notifyIntegration("inventory.cartons_created", {
      item_id: item.id,
      name: item.name,
      carton_count: cartons.length,
      quantity_per_carton: cartons[0]?.quantity ?? 0,
      carton_ids: cartons.map((carton) => carton.id),
      by: "api",
    }).catch(() => {});
    return NextResponse.json({ item, cartons }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to register boxes." },
      { status: 400 }
    );
  }
}
