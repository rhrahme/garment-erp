import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { readHandoverProofImage } from "@/lib/data/handover-proof-storage";
import { canAccessClient } from "@/lib/sales/access";
import {
  handoverProofOnTarget,
  loadHandoverProofTarget,
} from "@/lib/production/handover-proof";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ target: string; id: string; imageId: string }> }
) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { target, id, imageId } = await params;

  const loaded = await loadHandoverProofTarget(target, id);
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }
  if (loaded.kind === "sample" && !canAccessClient(session, loaded.client)) {
    return NextResponse.json({ error: "Sample not found." }, { status: 404 });
  }

  const image = handoverProofOnTarget(loaded);
  if (!image || image.id !== imageId) {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }

  const content = await readHandoverProofImage(image.stored_filename);
  if (!content) {
    return NextResponse.json({ error: "Image file is missing." }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(content), {
    headers: {
      "Content-Type": image.content_type,
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${image.filename.replace(/"/g, "")}"`,
    },
  });
}
