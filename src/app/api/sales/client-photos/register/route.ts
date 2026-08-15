import { NextResponse } from "next/server";
import { canAccessClientMedia } from "@/lib/auth/permissions";
import { requireAuthenticated } from "@/lib/auth/session";
import {
  clientMediaLimitError,
  clientMediaMaxBytes,
  resolveClientMediaContentType,
} from "@/lib/data/client-media";
import { CLIENT_PHOTOS_BUCKET, deleteClientPhoto } from "@/lib/data/client-photo-storage";
import { getClientById } from "@/lib/data/clients";
import { ensureDocumentsLoaded, isSupabaseDocumentsStorage } from "@/lib/data/document-persistence";
import { readSalesWorkspace } from "@/lib/data/sales-workspace";
import { canAccessClient } from "@/lib/sales/access";
import { attachSalesClientPhoto, replaceSalesClientPhoto } from "@/lib/sales/mutations";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ClientPhoto } from "@/lib/types/sales-workspace";

/**
 * Second step of the direct-to-storage upload (see ./upload-url): after the
 * browser PUT the file to the signed URL, this registers the photo on the
 * client. Verifies the object actually exists in the bucket and re-checks
 * the size limit server-side before attaching.
 */
export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session || !canAccessClientMedia(session)) {
    return NextResponse.json({ error: "Client media access required." }, { status: 403 });
  }
  if (!isSupabaseDocumentsStorage()) {
    return NextResponse.json({ error: "Direct uploads are not enabled here." }, { status: 400 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Storage is not configured." }, { status: 500 });
  }
  await ensureDocumentsLoaded(["clients", "sales_workspace"]);

  let body: {
    client_id?: string;
    replace_photo_id?: string;
    photo_id?: string;
    stored_filename?: string;
    filename?: string;
    content_type?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const replacePhotoId = String(body.replace_photo_id ?? "").trim();
  const photoId = replacePhotoId || String(body.photo_id ?? "").trim();
  const storedFilename = String(body.stored_filename ?? "").trim();
  const displayFilename = String(body.filename ?? "").trim() || "upload";
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

  // The stored filename must be one this client's upload-url step issued:
  // "<sanitized-client-id>-client-photo-<ts>-<rand>[.-...].<ext>", no slashes.
  const clientPrefix = `${clientId.replace(/[^a-z0-9-]/gi, "_")}-client-photo-`;
  if (
    !photoId.startsWith("client-photo-") ||
    !storedFilename.startsWith(clientPrefix) ||
    !storedFilename.includes(photoId) ||
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
    .list("client-photos", { search: storedFilename, limit: 5 });
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
      await deleteClientPhoto(storedFilename);
    } catch {
      /* best-effort */
    }
    return NextResponse.json({ error: clientMediaLimitError(contentType) }, { status: 400 });
  }

  if (replacePhotoId) {
    const replaced = await replaceSalesClientPhoto(
      replacePhotoId,
      {
        filename: displayFilename,
        stored_filename: storedFilename,
        content_type: contentType,
        size_bytes: sizeBytes,
        uploaded_at: new Date().toISOString(),
        uploaded_by: session.email,
      },
      session.email
    );
    if (!replaced) {
      try {
        await deleteClientPhoto(storedFilename);
      } catch {
        /* best-effort */
      }
      return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    }
    if (replaced.previous_stored_filename !== storedFilename) {
      try {
        await deleteClientPhoto(replaced.previous_stored_filename);
      } catch {
        /* best-effort storage cleanup */
      }
    }
    return NextResponse.json({ photo: replaced.photo });
  }

  const photo: ClientPhoto = {
    id: photoId,
    filename: displayFilename,
    stored_filename: storedFilename,
    content_type: contentType,
    size_bytes: sizeBytes,
    uploaded_at: new Date().toISOString(),
    uploaded_by: session.email,
  };
  await attachSalesClientPhoto(clientId, photo);
  return NextResponse.json({ photo }, { status: 201 });
}
