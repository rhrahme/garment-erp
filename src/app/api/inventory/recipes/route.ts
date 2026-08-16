import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { setGarmentRecipe } from "@/lib/data/inventory-store";
import { notifyIntegration } from "@/lib/integrations";

export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  await ensureDocumentsLoaded(["inventory_store"]);

  let body: {
    garment_type?: string;
    lines?: Array<{ item_id?: string; quantity_per_garment?: number }>;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const garmentType = String(body.garment_type ?? "").trim();
  if (!garmentType) {
    return NextResponse.json({ error: "Garment type is required." }, { status: 400 });
  }
  const lines = Array.isArray(body.lines)
    ? body.lines.map((line) => ({
        item_id: String(line.item_id ?? ""),
        quantity_per_garment: Number(line.quantity_per_garment) || 0,
      }))
    : [];

  try {
    const recipe = await setGarmentRecipe(garmentType, lines, session.email);
    await notifyIntegration("inventory.recipe_updated", {
      garment_type: recipe.garment_type,
      lines: recipe.lines,
      by: session.email,
    }).catch(() => {});
    return NextResponse.json({ recipe });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save the recipe." },
      { status: 400 }
    );
  }
}
