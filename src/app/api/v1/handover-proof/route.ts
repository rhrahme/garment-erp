import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { verifyApiKey } from "@/lib/integrations";
import { attachHandoverProof, loadHandoverProofTarget } from "@/lib/production/handover-proof";
import { isHandoverProofTarget, type HandoverProofImage } from "@/lib/production/garment-handover";

/**
 * Zapier/API parity for attaching a handover proof that is already in storage
 * (same stored_filename the ERP upload-url issued). File bytes stay on the
 * signed-upload path; this registers the record.
 */
export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  let body: {
    target?: string;
    target_id?: string;
    image_id?: string;
    stored_filename?: string;
    filename?: string;
    content_type?: string;
    size_bytes?: number;
    actor?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const targetRaw = String(body.target ?? "").trim();
  const targetId = String(body.target_id ?? "").trim();
  const imageId = String(body.image_id ?? "").trim();
  const storedFilename = String(body.stored_filename ?? "").trim();
  const displayFilename = String(body.filename ?? "").trim() || "upload";
  const contentType = String(body.content_type ?? "").trim() || "image/jpeg";
  const sizeBytes = Number(body.size_bytes);

  if (!isHandoverProofTarget(targetRaw)) {
    return NextResponse.json({ error: "Unknown handover proof target." }, { status: 400 });
  }
  if (!imageId || !storedFilename) {
    return NextResponse.json(
      { error: "image_id and stored_filename are required." },
      { status: 400 }
    );
  }

  await ensureDocumentsLoaded(["clients", "production_work_orders"]);
  const loaded = await loadHandoverProofTarget(targetRaw, targetId);
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  const image: HandoverProofImage = {
    id: imageId,
    filename: displayFilename,
    stored_filename: storedFilename,
    content_type: contentType,
    size_bytes: Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : 0,
    uploaded_at: new Date().toISOString(),
    uploaded_by: String(body.actor ?? "").trim() || "api",
  };
  const attached = await attachHandoverProof(targetRaw, targetId, image);
  if (!attached.ok) {
    return NextResponse.json({ error: attached.error }, { status: attached.status });
  }
  return NextResponse.json({ image }, { status: 201 });
}
