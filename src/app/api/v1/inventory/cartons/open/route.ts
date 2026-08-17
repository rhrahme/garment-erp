import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { openInventoryCarton } from "@/lib/data/inventory-store";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { notifyIntegration } from "@/lib/integrations";

/** Zapier parity: scan-open a carton by id (adds its quantity to stock). */
export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  await ensureDocumentsLoaded(["inventory_store"]);

  let body: { carton_id?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const { carton, item, opened } = await openInventoryCarton(
      String(body.carton_id ?? "").trim(),
      "api"
    );
    if (opened) {
      await notifyIntegration("inventory.carton_opened", {
        carton_id: carton.id,
        item_id: item.id,
        name: item.name,
        quantity: carton.quantity,
        balance_after: item.quantity_on_hand,
        by: "api",
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
