import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { readClientPhoto } from "@/lib/data/client-photo-storage";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSalesWorkspace } from "@/lib/data/sales-workspace";

export async function GET(
  _request: Request,
  context: { params: Promise<{ photoId: string }> }
) {
  const session = await requireAuthenticated();
  if (!session || (!session.isSalesOperator && !session.isAdmin)) {
    return NextResponse.json({ error: "Sales access required." }, { status: 403 });
  }
  await ensureDocumentsLoaded(["sales_workspace"]);
  const { photoId } = await context.params;
  const photo = readSalesWorkspace().client_details
    .flatMap((details) => details.photos)
    .find((item) => item.id === photoId);
  if (!photo) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  const content = await readClientPhoto(photo.stored_filename);
  if (!content) return NextResponse.json({ error: "Photo file not found." }, { status: 404 });
  return new NextResponse(new Uint8Array(content), {
    headers: {
      "Content-Type": photo.content_type,
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${photo.filename.replace(/"/g, "")}"`,
    },
  });
}
