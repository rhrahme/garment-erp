import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { ensureFabricReceivingDocumentsLoaded } from "@/lib/data/fabric-receiving-docs";
import { deleteThreadButtonPhotoFile } from "@/lib/data/thread-button-photo-storage";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import {
  findThreadButtonPhoto,
  removeThreadButtonPhoto,
} from "@/lib/production/thread-button-matching";

export const maxDuration = 60;

async function ensureMatchingDocsLoaded(): Promise<void> {
  await ensureFabricReceivingDocumentsLoaded();
  await ensureDocumentsLoaded(["thread_button_matches", "sales_orders"]);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ photoId: string }> }
) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensureMatchingDocsLoaded();
    const { photoId } = await context.params;
    const actor =
      new URL(request.url).searchParams.get("actor")?.trim() ||
      "api";
    const found = findThreadButtonPhoto(photoId);
    if (!found) return NextResponse.json({ error: "Photo not found." }, { status: 404 });

    const removed = await removeThreadButtonPhoto(photoId, actor, "api");
    if (!removed) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    await deleteThreadButtonPhotoFile(removed.photo.stored_filename);
    return NextResponse.json({ deleted: true, photo: removed.photo });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete photo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
