import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import {
  clientMediaLimitError,
  clientMediaMaxBytes,
  extensionFromFilename,
  resolveClientMediaContentType,
} from "@/lib/data/client-media";
import { writeClientSampleImage } from "@/lib/data/client-sample-storage";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { canAccessClient } from "@/lib/sales/access";
import {
  attachReadyMadeSampleImage,
  findSampleAcrossClients,
} from "@/lib/clients/ready-made-samples";
import type { ClientReadyMadeSampleImage } from "@/lib/types/clients";

/**
 * Multipart fallback for sample image uploads (local/file-storage dev where
 * signed URLs are unavailable; production uses ./upload-url + ./register).
 */
export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureDocumentsLoaded(["clients"]);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const sampleId = String(form.get("sample_id") ?? "").trim();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }

  const found = findSampleAcrossClients(sampleId);
  if (!found || !canAccessClient(session, found.client)) {
    return NextResponse.json({ error: "Sample not found." }, { status: 404 });
  }

  const contentType = resolveClientMediaContentType(file);
  if (!contentType) {
    return NextResponse.json({ error: clientMediaLimitError(null) }, { status: 400 });
  }
  if (file.size > clientMediaMaxBytes(contentType)) {
    return NextResponse.json({ error: clientMediaLimitError(contentType) }, { status: 400 });
  }

  const extension = extensionFromFilename(file.name) || "jpg";
  const imageId = `sample-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const storedFilename = `${sampleId.replace(/[^a-z0-9-]/gi, "_")}-${imageId}.${extension}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeClientSampleImage(storedFilename, buffer, contentType);

  const image: ClientReadyMadeSampleImage = {
    id: imageId,
    filename: file.name || "upload",
    stored_filename: storedFilename,
    content_type: contentType,
    size_bytes: file.size,
    uploaded_at: new Date().toISOString(),
    uploaded_by: session.email,
  };
  const attached = await attachReadyMadeSampleImage(sampleId, image);
  if (!attached.ok) {
    return NextResponse.json({ error: attached.error }, { status: attached.status });
  }
  return NextResponse.json({ image, sample: attached.sample }, { status: 201 });
}
