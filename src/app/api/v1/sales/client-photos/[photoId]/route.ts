import { NextResponse } from "next/server";
import { deleteClientPhoto } from "@/lib/data/client-photo-storage";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSalesWorkspace } from "@/lib/data/sales-workspace";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { removeSalesClientPhoto } from "@/lib/sales/mutations";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ photoId: string }> }
) {
  const authError = verifyApiKey(_request);
  if (authError) return authError;
  await ensureDocumentsLoaded(["clients", "sales_workspace"]);
  const { photoId } = await context.params;
  const exists = readSalesWorkspace().client_details.some((entry) =>
    entry.photos.some((item) => item.id === photoId)
  );
  if (!exists) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  const removed = await removeSalesClientPhoto(photoId, "api", "api");
  if (!removed) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  try {
    await deleteClientPhoto(removed.photo.stored_filename);
  } catch {
    /* best-effort storage cleanup */
  }
  return NextResponse.json({ ok: true, photo_id: photoId, client_id: removed.client_id });
}
