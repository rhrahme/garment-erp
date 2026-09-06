import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  deleteReadyMadeSample,
  updateReadyMadeSample,
} from "@/lib/clients/ready-made-samples";

/** Zapier parity for updating / returning / deleting a client sample. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  await ensureDocumentsLoaded(["clients"]);
  const { id } = await params;

  let body: {
    product_type?: string;
    purpose?: string;
    brand?: string;
    color?: string;
    size?: string;
    notes?: string;
    returned?: boolean;
    actor?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = await updateReadyMadeSample(
    id,
    body,
    String(body.actor ?? "").trim() || "api",
    "api"
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ sample: result.sample });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  await ensureDocumentsLoaded(["clients"]);
  const { id } = await params;
  const actor = new URL(request.url).searchParams.get("actor")?.trim() || "api";
  const result = await deleteReadyMadeSample(id, actor, "api");
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
