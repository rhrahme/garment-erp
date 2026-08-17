import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import {
  clientMediaLimitError,
  clientMediaMaxBytes,
  resolveClientMediaContentType,
} from "@/lib/data/client-media";
import { CLIENT_PHOTOS_BUCKET } from "@/lib/data/client-photo-storage";
import {
  CLIENT_SAMPLES_SUBDIR,
  deleteClientSampleImage,
} from "@/lib/data/client-sample-storage";
import { ensureDocumentsLoaded, isSupabaseDocumentsStorage } from "@/lib/data/document-persistence";
import { canAccessClient } from "@/lib/sales/access";
import {
  attachReadyMadeSampleImage,
  findSampleAcrossClients,
} from "@/lib/clients/ready-made-samples";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ClientReadyMadeSampleImage } from "@/lib/types/clients";

/** Second step of the sample image upload: verify the object and attach it. */
export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseDocumentsStorage()) {
    return NextResponse.json({ error: "Direct uploads are not enabled here." }, { status: 400 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Storage is not configured." }, { status: 500 });
  }
  await ensureDocumentsLoaded(["clients"]);

  let body: {
    sample_id?: string;
    image_id?: string;
    stored_filename?: string;
    filename?: string;
    content_type?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sampleId = String(body.sample_id ?? "").trim();
  const imageId = String(body.image_id ?? "").trim();
  const storedFilename = String(body.stored_filename ?? "").trim();
  const displayFilename = String(body.filename ?? "").trim() || "upload";

  const found = findSampleAcrossClients(sampleId);
  if (!found || !canAccessClient(session, found.client)) {
    return NextResponse.json({ error: "Sample not found." }, { status: 404 });
  }

  // Stored filename must be one ./upload-url issued for this sample.
  const samplePrefix = `${sampleId.replace(/[^a-z0-9-]/gi, "_")}-sample-image-`;
  if (
    !imageId.startsWith("sample-image-") ||
    !storedFilename.startsWith(samplePrefix) ||
    !storedFilename.includes(imageId) ||
    !/^[a-z0-9_.-]+$/i.test(storedFilename)
  ) {
    return NextResponse.json({ error: "Invalid upload reference." }, { status: 400 });
  }

  const contentType = resolveClientMediaContentType({
    type: String(body.content_type ?? ""),
    name: storedFilename,
  });
  if (!contentType) {
    return NextResponse.json({ error: clientMediaLimitError(null) }, { status: 400 });
  }

  const { data: objects, error: listError } = await admin.storage
    .from(CLIENT_PHOTOS_BUCKET)
    .list(CLIENT_SAMPLES_SUBDIR, { search: storedFilename, limit: 5 });
  const object = objects?.find((item) => item.name === storedFilename);
  if (listError || !object) {
    return NextResponse.json(
      { error: "Upload not found in storage. Retry the upload." },
      { status: 404 }
    );
  }
  const sizeBytes = Number(object.metadata?.size ?? 0);
  if (sizeBytes > clientMediaMaxBytes(contentType)) {
    try {
      await deleteClientSampleImage(storedFilename);
    } catch {
      /* best-effort */
    }
    return NextResponse.json({ error: clientMediaLimitError(contentType) }, { status: 400 });
  }

  const image: ClientReadyMadeSampleImage = {
    id: imageId,
    filename: displayFilename,
    stored_filename: storedFilename,
    content_type: contentType,
    size_bytes: sizeBytes,
    uploaded_at: new Date().toISOString(),
    uploaded_by: session.email,
  };
  const attached = await attachReadyMadeSampleImage(sampleId, image);
  if (!attached.ok) {
    return NextResponse.json({ error: attached.error }, { status: attached.status });
  }
  return NextResponse.json({ image, sample: attached.sample }, { status: 201 });
}
