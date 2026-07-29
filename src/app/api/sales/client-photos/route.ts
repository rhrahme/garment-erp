import { NextResponse } from "next/server";
import {
  canAccessClientMedia,
} from "@/lib/auth/permissions";
import { requireAuthenticated } from "@/lib/auth/session";
import {
  clientMediaLimitError,
  clientMediaMaxBytes,
  prepareClientMediaForStorage,
  resolveClientMediaContentType,
} from "@/lib/data/client-media";
import { writeClientPhoto } from "@/lib/data/client-photo-storage";
import { getClientById } from "@/lib/data/clients";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSalesWorkspace } from "@/lib/data/sales-workspace";
import { canAccessClient } from "@/lib/sales/access";
import { attachSalesClientPhoto } from "@/lib/sales/mutations";
import type { ClientPhoto } from "@/lib/types/sales-workspace";

export const maxDuration = 60;

export async function GET(request: Request) {
  const session = await requireAuthenticated();
  if (!session || !canAccessClientMedia(session)) {
    return NextResponse.json({ error: "Client media access required." }, { status: 403 });
  }
  await ensureDocumentsLoaded(["clients", "sales_workspace"]);
  const clientId = new URL(request.url).searchParams.get("client_id")?.trim() ?? "";
  const client = getClientById(clientId);
  if (!clientId || !client) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }
  if (!canAccessClient(session, client)) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }
  const details = readSalesWorkspace().client_details.find((entry) => entry.client_id === clientId);
  return NextResponse.json({ photos: details?.photos ?? [] });
}

export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session || !canAccessClientMedia(session)) {
    return NextResponse.json({ error: "Client media access required." }, { status: 403 });
  }
  await ensureDocumentsLoaded(["clients", "sales_workspace"]);
  const form = await request.formData();
  const clientId = String(form.get("client_id") ?? "").trim();
  const client = getClientById(clientId);
  const file = form.get("photo");
  if (!clientId || !client) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }
  if (!canAccessClient(session, client)) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "photo file is required." }, { status: 400 });
  }
  const contentType = resolveClientMediaContentType(file);
  if (!contentType) {
    return NextResponse.json({ error: clientMediaLimitError(null) }, { status: 400 });
  }
  if (file.size > clientMediaMaxBytes(contentType)) {
    return NextResponse.json({ error: clientMediaLimitError(contentType) }, { status: 400 });
  }

  let prepared;
  try {
    prepared = await prepareClientMediaForStorage(file, contentType);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Failed to process media.";
    return NextResponse.json(
      { error: `Could not process this file (${message}). Try exporting as JPG or MP4.` },
      { status: 400 }
    );
  }

  const id = `client-photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const storedFilename = `${clientId.replace(/[^a-z0-9-]/gi, "_")}-${id}.${prepared.extension}`;
  await writeClientPhoto(storedFilename, prepared.buffer, prepared.contentType);
  const photo: ClientPhoto = {
    id,
    filename: prepared.displayFilename,
    stored_filename: storedFilename,
    content_type: prepared.contentType,
    size_bytes: prepared.sizeBytes,
    uploaded_at: new Date().toISOString(),
    uploaded_by: session.email,
  };
  await attachSalesClientPhoto(clientId, photo);
  return NextResponse.json({ photo }, { status: 201 });
}
