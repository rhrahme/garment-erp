import { NextResponse } from "next/server";
import { requireAuthenticated, sessionActor } from "@/lib/auth/session";
import {
  clientMediaLimitError,
  clientMediaMaxBytes,
  extensionFromFilename,
  resolveClientMediaContentType,
} from "@/lib/data/client-media";
import { writeHandoverProofImage } from "@/lib/data/handover-proof-storage";
import { canAccessClient } from "@/lib/sales/access";
import {
  attachHandoverProof,
  canWriteWorkOrderHandoverProof,
  loadHandoverProofTarget,
} from "@/lib/production/handover-proof";
import { isHandoverProofTarget, type HandoverProofImage } from "@/lib/production/garment-handover";

/**
 * Multipart fallback for handover proof uploads (local/file-storage dev where
 * signed URLs are unavailable; production uses ./upload-url + ./register).
 */
export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const targetRaw = String(form.get("target") ?? "").trim();
  const targetId = String(form.get("target_id") ?? "").trim();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }
  if (!isHandoverProofTarget(targetRaw)) {
    return NextResponse.json({ error: "Unknown handover proof target." }, { status: 400 });
  }

  const loaded = await loadHandoverProofTarget(targetRaw, targetId);
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }
  if (loaded.kind === "sample" && !canAccessClient(session, loaded.client)) {
    return NextResponse.json({ error: "Sample not found." }, { status: 404 });
  }
  if (loaded.kind === "work_order" && !canWriteWorkOrderHandoverProof(session)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const contentType = resolveClientMediaContentType(file);
  if (!contentType) {
    return NextResponse.json({ error: clientMediaLimitError(null) }, { status: 400 });
  }
  if (file.size > clientMediaMaxBytes(contentType)) {
    return NextResponse.json({ error: clientMediaLimitError(contentType) }, { status: 400 });
  }

  const extension = extensionFromFilename(file.name) || "jpg";
  const imageId = `handover-proof-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const storedFilename = `${targetRaw}-${targetId.replace(/[^a-z0-9-]/gi, "_")}-${imageId}.${extension}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeHandoverProofImage(storedFilename, buffer, contentType);

  const image: HandoverProofImage = {
    id: imageId,
    filename: file.name || "upload",
    stored_filename: storedFilename,
    content_type: contentType,
    size_bytes: file.size,
    uploaded_at: new Date().toISOString(),
    uploaded_by: sessionActor(session),
  };
  const attached = await attachHandoverProof(targetRaw, targetId, image);
  if (!attached.ok) {
    return NextResponse.json({ error: attached.error }, { status: attached.status });
  }
  return NextResponse.json({ image }, { status: 201 });
}
