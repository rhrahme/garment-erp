import { NextResponse } from "next/server";
import { getClientById } from "@/lib/data/clients";
import {
  resolveClientPhotoContentType,
  writeClientPhoto,
} from "@/lib/data/client-photo-storage";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { attachSalesClientPhoto } from "@/lib/sales/mutations";
import type { ClientPhoto } from "@/lib/types/sales-workspace";

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  await ensureDocumentsLoaded(["clients", "sales_workspace"]);
  const form = await request.formData();
  const clientId = String(form.get("client_id") ?? "").trim();
  const file = form.get("photo");
  if (!clientId || !getClientById(clientId)) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }
  if (!(file instanceof File) || file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "A supported photo under 10 MB is required." }, { status: 400 });
  }
  const contentType = resolveClientPhotoContentType(file);
  if (!contentType) {
    return NextResponse.json({ error: "A supported photo under 10 MB is required." }, { status: 400 });
  }
  const id = `client-photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const extension = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const storedFilename = `${clientId.replace(/[^a-z0-9-]/gi, "_")}-${id}.${extension}`;
  await writeClientPhoto(storedFilename, Buffer.from(await file.arrayBuffer()), contentType);
  const photo: ClientPhoto = {
    id,
    filename: file.name,
    stored_filename: storedFilename,
    content_type: contentType,
    size_bytes: file.size,
    uploaded_at: new Date().toISOString(),
    uploaded_by: "api",
  };
  await attachSalesClientPhoto(clientId, photo, "api");
  return NextResponse.json({ photo }, { status: 201 });
}
