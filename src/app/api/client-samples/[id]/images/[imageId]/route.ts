import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { readClientSampleImage } from "@/lib/data/client-sample-storage";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { canAccessClient } from "@/lib/sales/access";
import {
  findSampleAcrossClients,
  removeReadyMadeSampleImage,
} from "@/lib/clients/ready-made-samples";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureDocumentsLoaded(["clients"]);
  const { id, imageId } = await params;

  const found = findSampleAcrossClients(id);
  if (!found || !canAccessClient(session, found.client)) {
    return NextResponse.json({ error: "Sample not found." }, { status: 404 });
  }
  const image = found.sample.images.find((row) => row.id === imageId);
  if (!image) {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }

  const content = await readClientSampleImage(image.stored_filename);
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureDocumentsLoaded(["clients"]);
  const { id, imageId } = await params;

  const result = await removeReadyMadeSampleImage(id, imageId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ sample: result.sample });
}
