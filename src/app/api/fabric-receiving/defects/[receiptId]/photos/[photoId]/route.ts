import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureFabricReceivingDocumentsLoaded } from "@/lib/data/fabric-receiving-docs";
import { readDefectPhoto } from "@/lib/data/defect-photo-storage";
import { findDefectPhoto } from "@/lib/production/fabric-receiving-defects";

export async function GET(
  _request: Request,
  context: { params: Promise<{ receiptId: string; photoId: string }> }
) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    await ensureFabricReceivingDocumentsLoaded();
    const { receiptId, photoId } = await context.params;
    const match = findDefectPhoto(receiptId, photoId);
    if (!match) {
      return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    }

    const content = await readDefectPhoto(match.photo.stored_filename);
    if (!content) {
      return NextResponse.json({ error: "Photo not found in storage." }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(content), {
      headers: {
        "Content-Type": match.photo.content_type || "image/jpeg",
        "Content-Disposition": `inline; filename="${match.photo.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Failed to load defect photo:", error);
    return NextResponse.json({ error: "Failed to load photo." }, { status: 500 });
  }
}
