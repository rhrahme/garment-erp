import { NextResponse } from "next/server";
import { requireAuthenticated, type SessionContext } from "@/lib/auth/session";
import {
  CLIENT_IMAGE_MAX_BYTES,
  isClientVideoType,
  prepareClientMediaForStorage,
  resolveClientMediaContentType,
} from "@/lib/data/client-media";
import { writeThreadButtonPhoto } from "@/lib/data/thread-button-photo-storage";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { ensureFabricReceivingDocumentsLoaded } from "@/lib/data/fabric-receiving-docs";
import { notifyAdminsOfThreadButtonPhotoUpload } from "@/lib/integrations/thread-button-photo-alert";
import {
  attachThreadButtonPhoto,
  listUnacknowledgedThreadButtonPhotos,
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

export async function GET(request: Request) {
  const session = await requireAuthenticated();
  if (!session || !canAccessMatching(session)) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    await ensureMatchingDocsLoaded();
    const url = new URL(request.url);
    if (url.searchParams.get("unacknowledged") === "1") {
      if (!session.isAdmin) {
        return NextResponse.json({ error: "Admin access required." }, { status: 403 });
      }
      const rows = listUnacknowledgedThreadButtonPhotos(50);
      return NextResponse.json({
        items: rows.map(({ match, photo }) => ({
          ...photo,
          match_id: match.id,
          sales_order_id: match.sales_order_id,
          sales_order_line_id: match.sales_order_line_id,
          so_number: match.so_number,
          client_name: match.client_name,
          client_code: match.client_code,
          fabric_number: match.fabric_number,
          article_number: match.article_number,
          garment_type: match.garment_type,
          fabric_cut_code: match.fabric_cut_code,
        })),
      });
    }

    return NextResponse.json({
      error: "Provide unacknowledged=1 for the admin review queue.",
    }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list photos.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!canUpdateMatching(session)) {
    return NextResponse.json(
      { error: "Not allowed to upload thread/button photos." },
      { status: 403 }
    );
  }

  try {
    await ensureMatchingDocsLoaded();
    const form = await request.formData();
    const salesOrderLineId = String(form.get("sales_order_line_id") ?? "").trim();
    const file = form.get("photo");
    if (!salesOrderLineId) {
      return NextResponse.json({ error: "sales_order_line_id is required." }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: "Use a JPG, PNG, WebP, or HEIC image under 15 MB." },
        { status: 400 }
      );
    }

    const contentType = resolveClientMediaContentType(file);
    if (!contentType || isClientVideoType(contentType)) {
      return NextResponse.json(
        { error: "Use a JPG, PNG, WebP, or HEIC image under 15 MB." },
        { status: 400 }
      );
    }
    if (file.size > CLIENT_IMAGE_MAX_BYTES) {
      return NextResponse.json(
        { error: "Use a JPG, PNG, WebP, or HEIC image under 15 MB." },
        { status: 400 }
      );
    }

    let prepared;
    try {
      prepared = await prepareClientMediaForStorage(file, contentType);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to process image.";
      return NextResponse.json(
        { error: `Could not process this image (${message}). Try exporting as JPG.` },
        { status: 400 }
      );
    }

    const id = `tb-photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const storedFilename = `${salesOrderLineId.replace(/[^a-z0-9-]/gi, "_")}-${id}.${prepared.extension}`;
    await writeThreadButtonPhoto(storedFilename, prepared.buffer, prepared.contentType);

    const { match, photo } = await attachThreadButtonPhoto({
      sales_order_line_id: salesOrderLineId,
      photo: {
        id,
        filename: prepared.displayFilename,
        stored_filename: storedFilename,
        content_type: prepared.contentType,
        size_bytes: prepared.sizeBytes,
        uploaded_at: new Date().toISOString(),
        uploaded_by: session.email ?? session.userId ?? "unknown",
      },
      source: "erp",
    });

    const adminNotified = await notifyAdminsOfThreadButtonPhotoUpload(match, photo);

    return NextResponse.json({ photo, match_id: match.id, admin_notified: adminNotified }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload photo.";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
