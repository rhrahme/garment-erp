import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  findEntityAlbum,
  findEntityImage,
  readEntityImages,
  removeEntityImage,
} from "@/lib/data/entity-images";
import { readEntityImageFile } from "@/lib/data/entity-images-storage";
import { parseEntityKey } from "@/lib/entity-images/keys";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ albumKey: string; imageId: string }> }
) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureDocumentsLoaded(["entity_images"]);
  const { albumKey, imageId } = await params;
  const parsed = parseEntityKey(decodeURIComponent(albumKey));
  if (!parsed) {
    return NextResponse.json({ error: "Invalid album key." }, { status: 400 });
  }
  const store = await readEntityImages();
  const album = findEntityAlbum(store, parsed.key);
  if (!album) {
    return NextResponse.json({ error: "Album not found." }, { status: 404 });
  }
  const image = findEntityImage(album, imageId);
  if (!image) {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }
  const content = await readEntityImageFile(image.stored_filename);
  if (!content) {
    return NextResponse.json({ error: "Image file is missing." }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(content), {
    headers: {
      "Content-Type": image.content_type,
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${image.filename.replace(/"/g, "")}"`,
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ albumKey: string; imageId: string }> }
) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureDocumentsLoaded(["entity_images"]);
  const { albumKey, imageId } = await params;
  const parsed = parseEntityKey(decodeURIComponent(albumKey));
  if (!parsed) {
    return NextResponse.json({ error: "Invalid album key." }, { status: 400 });
  }
  try {
    const album = await removeEntityImage(parsed.key, imageId);
    return NextResponse.json({ album });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete image.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
