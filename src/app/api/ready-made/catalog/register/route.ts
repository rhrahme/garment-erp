import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import {
  clientMediaLimitError,
  clientMediaMaxBytes,
  resolveClientMediaContentType,
} from "@/lib/data/client-media";
import { CLIENT_PHOTOS_BUCKET } from "@/lib/data/client-photo-storage";
import { ensureDocumentsLoaded, isSupabaseDocumentsStorage } from "@/lib/data/document-persistence";
import { attachReadyMadeCatalogImage } from "@/lib/data/ready-made-catalog";
import {
  deleteReadyMadeCatalogImage,
  READY_MADE_CATALOG_SUBDIR,
} from "@/lib/data/ready-made-catalog-storage";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ReadyMadeCatalogImage } from "@/lib/types/ready-made-catalog";

export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseDocumentsStorage()) {
    return NextResponse.json({ error: "Direct uploads are not enabled here." }, { status: 400 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Storage is not configured." }, { status: 500 });
  }
  await ensureDocumentsLoaded(["ready_made_catalog"]);

  let body: {
    garment_id?: string;
    size?: string | null;
    image_id?: string;
    stored_filename?: string;
    filename?: string;
    content_type?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const garmentId = String(body.garment_id ?? "").trim();
  const imageId = String(body.image_id ?? "").trim();
  const storedFilename = String(body.stored_filename ?? "").trim();
  const displayFilename = String(body.filename ?? "").trim() || "upload";
  const prefix = `${garmentId.replace(/[^a-z0-9-]/gi, "_")}-rm-image-`;
  if (
    !imageId.startsWith("rm-image-") ||
    !storedFilename.startsWith(prefix) ||
    !storedFilename.includes(imageId) ||
    !/^[a-z0-9_.-]+$/i.test(storedFilename)
  ) {
    return NextResponse.json({ error: "Invalid upload reference." }, { status: 400 });
  }

  const contentType = resolveClientMediaContentType({
    type: String(body.content_type ?? ""),
    name: storedFilename,
  });
  if (!contentType) {
    return NextResponse.json({ error: clientMediaLimitError(null) }, { status: 400 });
  }

  const { data: objects, error: listError } = await admin.storage
    .from(CLIENT_PHOTOS_BUCKET)
    .list(READY_MADE_CATALOG_SUBDIR, { search: storedFilename, limit: 5 });
  const object = objects?.find((item) => item.name === storedFilename);
  if (listError || !object) {
    return NextResponse.json(
      { error: "Upload not found in storage. Retry the upload." },
      { status: 404 }
    );
  }
  const sizeBytes = Number(object.metadata?.size ?? 0);
  if (sizeBytes > clientMediaMaxBytes(contentType)) {
    try {
      await deleteReadyMadeCatalogImage(storedFilename);
    } catch {
      /* best-effort */
    }
    return NextResponse.json({ error: clientMediaLimitError(contentType) }, { status: 400 });
  }

  const image: ReadyMadeCatalogImage = {
    id: imageId,
    filename: displayFilename,
    stored_filename: storedFilename,
    content_type: contentType,
    size_bytes: sizeBytes,
    uploaded_at: new Date().toISOString(),
    uploaded_by: session.email,
  };

  try {
    const garment = await attachReadyMadeCatalogImage({
      garment_id: garmentId,
      size: body.size ?? null,
      image,
      actor: session.email,
    });
    return NextResponse.json({ image, garment }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not attach image.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
