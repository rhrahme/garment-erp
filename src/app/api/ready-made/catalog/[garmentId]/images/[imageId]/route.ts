import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  findReadyMadeCatalogGarment,
  findReadyMadeCatalogImage,
  readReadyMadeCatalog,
  removeReadyMadeCatalogImage,
} from "@/lib/data/ready-made-catalog";
import { readReadyMadeCatalogImage } from "@/lib/data/ready-made-catalog-storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ garmentId: string; imageId: string }> }
) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureDocumentsLoaded(["ready_made_catalog"]);
  const { garmentId, imageId } = await params;
  const catalog = await readReadyMadeCatalog();
  const garment = findReadyMadeCatalogGarment(catalog, garmentId);
  if (!garment) {
    return NextResponse.json({ error: "Garment not found." }, { status: 404 });
  }
  const found = findReadyMadeCatalogImage(garment, imageId);
  if (!found) {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }
  const content = await readReadyMadeCatalogImage(found.image.stored_filename);
  if (!content) {
    return NextResponse.json({ error: "Image file is missing." }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(content), {
    headers: {
      "Content-Type": found.image.content_type,
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${found.image.filename.replace(/"/g, "")}"`,
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ garmentId: string; imageId: string }> }
) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureDocumentsLoaded(["ready_made_catalog"]);
  const { garmentId, imageId } = await params;
  try {
    const garment = await removeReadyMadeCatalogImage(garmentId, imageId);
    return NextResponse.json({ garment });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete image.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
