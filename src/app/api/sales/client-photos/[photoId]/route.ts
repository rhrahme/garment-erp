import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import {
  convertHeicBufferToJpeg,
  looksLikeHeicMedia,
} from "@/lib/data/client-media";
import { deleteClientPhoto, readClientPhoto } from "@/lib/data/client-photo-storage";
import { getClientById } from "@/lib/data/clients";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSalesWorkspace } from "@/lib/data/sales-workspace";
import { canAccessClient } from "@/lib/sales/access";
import { removeSalesClientPhoto } from "@/lib/sales/mutations";

export const maxDuration = 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ photoId: string }> }
) {
  const session = await requireAuthenticated();
  if (!session || (!session.isSalesOperator && !session.isAdmin)) {
    return NextResponse.json({ error: "Sales access required." }, { status: 403 });
  }
  await ensureDocumentsLoaded(["clients", "sales_workspace"]);
  const { photoId } = await context.params;
  const details = readSalesWorkspace().client_details.find((entry) =>
    entry.photos.some((item) => item.id === photoId)
  );
  const photo = details?.photos.find((item) => item.id === photoId);
  if (!details || !photo) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  const client = getClientById(details.client_id);
  if (!canAccessClient(session, client)) {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }
  const content = await readClientPhoto(photo.stored_filename);
  if (!content) return NextResponse.json({ error: "Photo file not found." }, { status: 404 });

  let body = content;
  let contentType = photo.content_type;
  let filename = photo.filename;

  if (
    looksLikeHeicMedia({
      contentType: photo.content_type,
      filename: photo.filename,
      storedFilename: photo.stored_filename,
      buffer: content,
    })
  ) {
    try {
      body = await convertHeicBufferToJpeg(content);
      contentType = "image/jpeg";
      filename = photo.filename.replace(/\.hei[cf]$/i, ".jpg");
    } catch {
      return NextResponse.json(
        { error: "Could not convert HEIC photo for display. Re-upload as JPG if needed." },
        { status: 422 }
      );
    }
  }

  const dispositionFilename = filename.replace(/"/g, "");
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${dispositionFilename}"`,
    },
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ photoId: string }> }
) {
  const session = await requireAuthenticated();
  if (!session || (!session.isSalesOperator && !session.isAdmin)) {
    return NextResponse.json({ error: "Sales access required." }, { status: 403 });
  }
  await ensureDocumentsLoaded(["clients", "sales_workspace"]);
  const { photoId } = await context.params;
  const details = readSalesWorkspace().client_details.find((entry) =>
    entry.photos.some((item) => item.id === photoId)
  );
  const photo = details?.photos.find((item) => item.id === photoId);
  if (!details || !photo) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  const client = getClientById(details.client_id);
  if (!canAccessClient(session, client)) {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }
  const removed = await removeSalesClientPhoto(photoId, session.email);
  if (!removed) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  try {
    await deleteClientPhoto(removed.photo.stored_filename);
  } catch {
    /* best-effort storage cleanup */
  }
  return NextResponse.json({ ok: true, photo_id: photoId });
}
