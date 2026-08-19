import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  addReadyMadeCatalogSize,
  ensureReadyMadeCatalogGarment,
  readReadyMadeCatalog,
} from "@/lib/data/ready-made-catalog";

/** Zapier parity for ready-made garment/size catalog. */
export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  await ensureDocumentsLoaded(["ready_made_catalog"]);
  return NextResponse.json(await readReadyMadeCatalog());
}

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  await ensureDocumentsLoaded(["ready_made_catalog"]);

  let body: {
    brand_id?: string;
    brand_label?: string;
    article?: string;
    garment_type?: string;
    garment_id?: string;
    size?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    if (body.size && body.garment_id) {
      const garment = await addReadyMadeCatalogSize(body.garment_id, body.size);
      return NextResponse.json({ garment });
    }
    const garment = await ensureReadyMadeCatalogGarment({
      brand_id: String(body.brand_id ?? ""),
      brand_label: String(body.brand_label ?? ""),
      article: String(body.article ?? ""),
      garment_type: String(body.garment_type ?? ""),
    });
    return NextResponse.json({ garment }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save garment.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
