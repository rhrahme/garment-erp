import { NextResponse } from "next/server";
import {
  canAccessClientMedia,
  canAssignClientPhotoToFabric,
  canHardDeleteClientMedia,
  isClientPhotoDeletePending,
} from "@/lib/auth/permissions";
import { requireAuthenticated } from "@/lib/auth/session";
import {
  clientMediaLimitError,
  clientMediaMaxBytes,
  convertHeicBufferToJpeg,
  looksLikeHeicMedia,
  prepareClientMediaForStorage,
  resolveClientMediaContentType,
} from "@/lib/data/client-media";
import { deleteClientPhoto, readClientPhoto, writeClientPhoto } from "@/lib/data/client-photo-storage";
import { getClientById } from "@/lib/data/clients";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSalesWorkspace } from "@/lib/data/sales-workspace";
import { canAccessClient } from "@/lib/sales/access";
import {
  assignSalesClientPhotoToFabric,
  clearSalesClientPhotoDeleteRequest,
  removeSalesClientPhoto,
  replaceSalesClientPhoto,
  requestSalesClientPhotoDelete,
} from "@/lib/sales/mutations";
import { readSalesOrders } from "@/lib/data/sales-orders";

export const maxDuration = 60;

function findPhoto(photoId: string) {
  const details = readSalesWorkspace().client_details.find((entry) =>
    entry.photos.some((item) => item.id === photoId)
  );
  const photo = details?.photos.find((item) => item.id === photoId);
  return details && photo ? { details, photo } : null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ photoId: string }> }
) {
  const session = await requireAuthenticated();
  if (!session || !canAccessClientMedia(session)) {
    return NextResponse.json({ error: "Client media access required." }, { status: 403 });
  }
  await ensureDocumentsLoaded(["clients", "sales_workspace"]);
  const { photoId } = await context.params;
  const found = findPhoto(photoId);
  if (!found) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  const client = getClientById(found.details.client_id);
  if (!canAccessClient(session, client)) {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }
  const content = await readClientPhoto(found.photo.stored_filename);
  if (!content) return NextResponse.json({ error: "Photo file not found." }, { status: 404 });

  let body = content;
  let contentType = found.photo.content_type;
  let filename = found.photo.filename;

  if (
    looksLikeHeicMedia({
      contentType: found.photo.content_type,
      filename: found.photo.filename,
      storedFilename: found.photo.stored_filename,
      buffer: content,
    })
  ) {
    try {
      body = await convertHeicBufferToJpeg(content);
      contentType = "image/jpeg";
      filename = found.photo.filename.replace(/\.hei[cf]$/i, ".jpg");
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

/**
 * Actions on an existing photo:
 * - request_delete: non-admin (or admin) marks for deletion
 * - cancel_request / keep: clear pending delete request
 * - replace: multipart upload of a new file for the same photo id
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ photoId: string }> }
) {
  const session = await requireAuthenticated();
  if (!session || !canAccessClientMedia(session)) {
    return NextResponse.json({ error: "Client media access required." }, { status: 403 });
  }
  await ensureDocumentsLoaded(["clients", "sales_workspace"]);
  const { photoId } = await context.params;
  const found = findPhoto(photoId);
  if (!found) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  const client = getClientById(found.details.client_id);
  if (!canAccessClient(session, client)) {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }

  const contentTypeHeader = request.headers.get("content-type") ?? "";
  if (contentTypeHeader.includes("multipart/form-data")) {
    const form = await request.formData();
    const action = String(form.get("action") ?? "replace").trim();
    if (action !== "replace") {
      return NextResponse.json({ error: "Unsupported multipart action." }, { status: 400 });
    }
    const file = form.get("photo");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "photo file is required." }, { status: 400 });
    }
    const mediaType = resolveClientMediaContentType(file);
    if (!mediaType) {
      return NextResponse.json({ error: clientMediaLimitError(null) }, { status: 400 });
    }
    if (file.size > clientMediaMaxBytes(mediaType)) {
      return NextResponse.json({ error: clientMediaLimitError(mediaType) }, { status: 400 });
    }

    let prepared;
    try {
      prepared = await prepareClientMediaForStorage(file, mediaType);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to process media.";
      return NextResponse.json(
        { error: `Could not process this file (${message}). Try exporting as JPG or MP4.` },
        { status: 400 }
      );
    }

    const storedFilename = `${found.details.client_id.replace(/[^a-z0-9-]/gi, "_")}-${photoId}-${Date.now()}.${prepared.extension}`;
    await writeClientPhoto(storedFilename, prepared.buffer, prepared.contentType);
    const replaced = await replaceSalesClientPhoto(
      photoId,
      {
        filename: prepared.displayFilename,
        stored_filename: storedFilename,
        content_type: prepared.contentType,
        size_bytes: prepared.sizeBytes,
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

  let body: {
    action?: string;
    fabric_line_id?: string | null;
    article_number?: string | null;
    sales_order_id?: string | null;
    so_number?: string | null;
    client_pattern_id?: string | null;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const action = String(body.action ?? "").trim();

  if (action === "assign" || action === "unassign") {
    if (!canAssignClientPhotoToFabric(session)) {
      return NextResponse.json(
        { error: "Pattern or admin access required to assign photos to fabrics." },
        { status: 403 }
      );
    }
    let fabricLineId =
      action === "unassign" ? null : body.fabric_line_id?.trim() || null;
    let articleNumber = body.article_number?.trim() || null;
    let salesOrderId = body.sales_order_id?.trim() || null;
    let soNumber = body.so_number?.trim() || null;
    const clientPatternId = body.client_pattern_id?.trim() || null;

    if (fabricLineId) {
      await ensureDocumentsLoaded(["sales_orders"]);
      const orders = readSalesOrders().orders;
      let matched = false;
      for (const order of orders) {
        if (order.client_id !== found.details.client_id) continue;
        const line = order.fabric_lines.find((entry) => entry.id === fabricLineId);
        if (!line) continue;
        matched = true;
        articleNumber = articleNumber || line.fabric_number || null;
        salesOrderId = salesOrderId || order.id;
        soNumber = soNumber || order.so_number;
        break;
      }
      if (!matched) {
        return NextResponse.json(
          { error: "Fabric line not found for this client." },
          { status: 400 }
        );
      }
    } else if (action === "assign") {
      return NextResponse.json({ error: "fabric_line_id is required." }, { status: 400 });
    }

    const updated = await assignSalesClientPhotoToFabric(
      photoId,
      {
        fabric_line_id: fabricLineId,
        article_number: articleNumber,
        sales_order_id: salesOrderId,
        so_number: soNumber,
        client_pattern_id: clientPatternId,
      },
      session.email
    );
    if (!updated) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    return NextResponse.json({ photo: updated.photo });
  }

  if (action === "request_delete") {
    if (canHardDeleteClientMedia(session)) {
      return NextResponse.json(
        { error: "Admins can delete directly. Use Delete or Confirm delete." },
        { status: 400 }
      );
    }
    const updated = await requestSalesClientPhotoDelete(photoId, session.email);
    if (!updated) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    return NextResponse.json({ photo: updated.photo });
  }

  if (action === "cancel_request" || action === "keep") {
    const pending = isClientPhotoDeletePending(found.photo);
    if (!pending) {
      return NextResponse.json({ photo: found.photo });
    }
    if (action === "keep" && !canHardDeleteClientMedia(session)) {
      return NextResponse.json({ error: "Only admins can reject delete requests." }, { status: 403 });
    }
    if (
      action === "cancel_request" &&
      !canHardDeleteClientMedia(session) &&
      found.photo.delete_requested_by?.trim().toLowerCase() !== session.email?.trim().toLowerCase()
    ) {
      return NextResponse.json(
        { error: "You can only cancel your own delete request." },
        { status: 403 }
      );
    }
    const updated = await clearSalesClientPhotoDeleteRequest(photoId, session.email);
    if (!updated) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    return NextResponse.json({ photo: updated.photo });
  }

  if (action === "confirm_delete") {
    if (!canHardDeleteClientMedia(session)) {
      return NextResponse.json({ error: "Only admins can confirm delete." }, { status: 403 });
    }
    if (!isClientPhotoDeletePending(found.photo)) {
      return NextResponse.json({ error: "No pending delete request for this photo." }, { status: 400 });
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

  return NextResponse.json(
    {
      error:
        "Unsupported action. Use assign, unassign, request_delete, cancel_request, keep, confirm_delete, or replace.",
    },
    { status: 400 }
  );
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ photoId: string }> }
) {
  const session = await requireAuthenticated();
  if (!session || !canAccessClientMedia(session)) {
    return NextResponse.json({ error: "Client media access required." }, { status: 403 });
  }
  if (!canHardDeleteClientMedia(session)) {
    return NextResponse.json(
      { error: "Only admins can delete photos. Request a delete instead." },
      { status: 403 }
    );
  }
  await ensureDocumentsLoaded(["clients", "sales_workspace"]);
  const { photoId } = await context.params;
  const found = findPhoto(photoId);
  if (!found) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  const client = getClientById(found.details.client_id);
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
