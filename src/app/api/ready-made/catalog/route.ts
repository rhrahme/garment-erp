import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  addReadyMadeCatalogSize,
  ensureReadyMadeCatalogGarment,
  readReadyMadeCatalog,
} from "@/lib/data/ready-made-catalog";

export async function GET() {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureDocumentsLoaded(["ready_made_catalog"]);
  const catalog = await readReadyMadeCatalog();
  return NextResponse.json(catalog);
}

export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
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
