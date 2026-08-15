import { NextResponse } from "next/server";
import { canAccessClientMedia } from "@/lib/auth/permissions";
import { requireAuthenticated } from "@/lib/auth/session";
import {
  clientMediaLimitError,
  clientMediaMaxBytes,
  extensionFromFilename,
  resolveClientMediaContentType,
} from "@/lib/data/client-media";
import { CLIENT_PHOTOS_BUCKET } from "@/lib/data/client-photo-storage";
import { getClientById } from "@/lib/data/clients";
import { ensureDocumentsLoaded, isSupabaseDocumentsStorage } from "@/lib/data/document-persistence";
import { readSalesWorkspace } from "@/lib/data/sales-workspace";
import { canAccessClient } from "@/lib/sales/access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Direct-to-storage uploads. Vercel caps request bodies at ~4.5 MB, so phone
 * photos/videos above that can NEVER reach /api/sales/client-photos in
 * production (browser gets a platform 413). This route hands the browser a
 * Supabase signed upload URL instead; the file goes straight to storage and
 * is then registered via /api/sales/client-photos/register.
 */
export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session || !canAccessClientMedia(session)) {
    return NextResponse.json({ error: "Client media access required." }, { status: 403 });
  }
  await ensureDocumentsLoaded(["clients", "sales_workspace"]);

  let body: {
    client_id?: string;
    replace_photo_id?: string;
    filename?: string;
    content_type?: string;
    size_bytes?: number;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const filename = String(body.filename ?? "").trim() || "upload";
  const replacePhotoId = String(body.replace_photo_id ?? "").trim();
  let clientId = String(body.client_id ?? "").trim();

  if (replacePhotoId) {
    const details = readSalesWorkspace().client_details.find((entry) =>
      entry.photos.some((item) => item.id === replacePhotoId)
    );
    if (!details) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    clientId = details.client_id;
  }

  const client = getClientById(clientId);
  if (!clientId || !client) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }
  if (!canAccessClient(session, client)) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  const contentType = resolveClientMediaContentType({
    type: String(body.content_type ?? ""),
    name: filename,
  });
  if (!contentType) {
    return NextResponse.json({ error: clientMediaLimitError(null) }, { status: 400 });
  }
  const sizeBytes = Number(body.size_bytes);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return NextResponse.json({ error: "size_bytes is required." }, { status: 400 });
  }
  if (sizeBytes > clientMediaMaxBytes(contentType)) {
    return NextResponse.json({ error: clientMediaLimitError(contentType) }, { status: 400 });
  }

  // Local/file-storage dev has no Vercel body cap; keep the legacy multipart path.
  const admin = isSupabaseDocumentsStorage() ? getSupabaseAdmin() : null;
  if (!admin) {
    return NextResponse.json({ mode: "direct" });
  }

  const extension = extensionFromFilename(filename) || "jpg";
  const photoId = replacePhotoId || `client-photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const storedFilename = replacePhotoId
    ? `${clientId.replace(/[^a-z0-9-]/gi, "_")}-${replacePhotoId}-${Date.now()}.${extension}`
    : `${clientId.replace(/[^a-z0-9-]/gi, "_")}-${photoId}.${extension}`;

  const { data, error } = await admin.storage
    .from(CLIENT_PHOTOS_BUCKET)
    .createSignedUploadUrl(`client-photos/${storedFilename}`);
  if (error || !data) {
    console.error("Failed to create signed upload URL:", error);
    return NextResponse.json(
      { error: "Could not prepare the upload. Try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    mode: "signed",
    photo_id: photoId,
    stored_filename: storedFilename,
    content_type: contentType,
    upload_url: data.signedUrl,
  });
}
