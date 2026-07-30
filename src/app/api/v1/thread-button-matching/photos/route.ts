import { NextResponse } from "next/server";
import {
  CLIENT_IMAGE_MAX_BYTES,
  isClientVideoType,
  prepareClientMediaForStorage,
  resolveClientMediaContentType,
} from "@/lib/data/client-media";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { ensureFabricReceivingDocumentsLoaded } from "@/lib/data/fabric-receiving-docs";
import { writeThreadButtonPhoto } from "@/lib/data/thread-button-photo-storage";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { notifyAdminsOfThreadButtonPhotoUpload } from "@/lib/integrations/thread-button-photo-alert";
import { attachThreadButtonPhoto } from "@/lib/production/thread-button-matching";

export const maxDuration = 60;

async function ensureMatchingDocsLoaded(): Promise<void> {
  await ensureFabricReceivingDocumentsLoaded();
  await ensureDocumentsLoaded(["thread_button_matches", "sales_orders"]);
}

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensureMatchingDocsLoaded();
    const form = await request.formData();
    const salesOrderLineId = String(form.get("sales_order_line_id") ?? "").trim();
    const actor = String(form.get("actor") ?? "api").trim() || "api";
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
        uploaded_by: actor,
      },
      source: "api",
    });

    const adminNotified = await notifyAdminsOfThreadButtonPhotoUpload(match, photo);
    return NextResponse.json(
      { photo, match_id: match.id, admin_notified: adminNotified },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload photo.";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
