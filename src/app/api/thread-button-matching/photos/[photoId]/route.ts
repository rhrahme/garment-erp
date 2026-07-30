import { NextResponse } from "next/server";
import { requireAuthenticated, type SessionContext } from "@/lib/auth/session";
import {
  convertHeicBufferToJpeg,
  looksLikeHeicMedia,
} from "@/lib/data/client-media";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { ensureFabricReceivingDocumentsLoaded } from "@/lib/data/fabric-receiving-docs";
import {
  deleteThreadButtonPhotoFile,
  readThreadButtonPhoto,
} from "@/lib/data/thread-button-photo-storage";
import {
  acknowledgeThreadButtonPhoto,
  clearThreadButtonPhotoDeleteRequest,
  findThreadButtonPhoto,
  removeThreadButtonPhoto,
  requestThreadButtonPhotoDelete,
} from "@/lib/production/thread-button-matching";

export const maxDuration = 60;

function canAccessMatching(session: SessionContext): boolean {
  return Boolean(session.userId || session.email);
}

function canUpdateMatching(session: SessionContext): boolean {
  return (
    session.isAdmin ||
    session.isClientManager ||
    session.isTaskOperator ||
    session.isProductionOperator
  );
}

async function ensureMatchingDocsLoaded(): Promise<void> {
  await ensureFabricReceivingDocumentsLoaded();
  await ensureDocumentsLoaded(["thread_button_matches", "sales_orders"]);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ photoId: string }> }
) {
  const session = await requireAuthenticated();
  if (!session || !canAccessMatching(session)) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  await ensureMatchingDocsLoaded();
  const { photoId } = await context.params;
  const found = findThreadButtonPhoto(photoId);
  if (!found) return NextResponse.json({ error: "Photo not found." }, { status: 404 });

  const content = await readThreadButtonPhoto(found.photo.stored_filename);
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

export async function POST(
  request: Request,
  context: { params: Promise<{ photoId: string }> }
) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!canUpdateMatching(session) && !session.isAdmin) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  await ensureMatchingDocsLoaded();
  const { photoId } = await context.params;
  const found = findThreadButtonPhoto(photoId);
  if (!found) return NextResponse.json({ error: "Photo not found." }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const action = String(body.action ?? "").trim();
  const actor = session.email ?? session.userId ?? "unknown";

  if (action === "acknowledge") {
    if (!session.isAdmin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }
    const result = await acknowledgeThreadButtonPhoto(photoId, actor, "erp");
    if (!result) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    return NextResponse.json({ photo: result.photo, newly_acknowledged: result.newlyAcknowledged });
  }

  if (action === "request_delete") {
    if (session.isAdmin) {
      return NextResponse.json(
        { error: "Admins can delete photos directly." },
        { status: 400 }
      );
    }
    const photo = await requestThreadButtonPhotoDelete(photoId, actor);
    if (!photo) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    return NextResponse.json({ photo });
  }

  if (action === "cancel_request" || action === "keep") {
    if (action === "keep" && !session.isAdmin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }
    if (
      action === "cancel_request" &&
      !session.isAdmin &&
      found.photo.delete_requested_by !== actor
    ) {
      return NextResponse.json({ error: "Only the requester or an admin can cancel." }, { status: 403 });
    }
    const photo = await clearThreadButtonPhotoDeleteRequest(photoId);
    if (!photo) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    return NextResponse.json({ photo });
  }

  if (action === "confirm_delete") {
    if (!session.isAdmin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }
    if (!found.photo.delete_requested_at) {
      return NextResponse.json({ error: "No pending delete request." }, { status: 400 });
    }
    const removed = await removeThreadButtonPhoto(photoId, actor, "erp");
    if (!removed) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    await deleteThreadButtonPhotoFile(removed.photo.stored_filename);
    return NextResponse.json({ deleted: true, photo: removed.photo });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ photoId: string }> }
) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!session.isAdmin) {
    return NextResponse.json(
      { error: "Only admins can hard-delete photos. Use request delete instead." },
      { status: 403 }
    );
  }

  await ensureMatchingDocsLoaded();
  const { photoId } = await context.params;
  const found = findThreadButtonPhoto(photoId);
  if (!found) return NextResponse.json({ error: "Photo not found." }, { status: 404 });

  const removed = await removeThreadButtonPhoto(
    photoId,
    session.email ?? session.userId ?? "unknown",
    "erp"
  );
  if (!removed) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  await deleteThreadButtonPhotoFile(removed.photo.stored_filename);
  return NextResponse.json({ deleted: true, photo: removed.photo });
}
