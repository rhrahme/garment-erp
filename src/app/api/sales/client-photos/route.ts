import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { getClientById } from "@/lib/data/clients";
import {
  isAllowedClientPhotoType,
  writeClientPhoto,
} from "@/lib/data/client-photo-storage";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { canAccessClient } from "@/lib/sales/access";
import { attachSalesClientPhoto } from "@/lib/sales/mutations";
import type { ClientPhoto } from "@/lib/types/sales-workspace";

export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session || (!session.isSalesOperator && !session.isAdmin)) {
    return NextResponse.json({ error: "Sales access required." }, { status: 403 });
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
  if (!isAllowedClientPhotoType(file.type) || file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Use a JPG, PNG, WebP, HEIC, or HEIF under 10 MB." }, { status: 400 });
  }
  const id = `client-photo-${Date.now()}`;
  const extension = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const storedFilename = `${clientId.replace(/[^a-z0-9-]/gi, "_")}-${id}.${extension}`;
  await writeClientPhoto(storedFilename, Buffer.from(await file.arrayBuffer()), file.type);
  const photo: ClientPhoto = {
    id,
    filename: file.name,
    stored_filename: storedFilename,
    content_type: file.type,
    size_bytes: file.size,
    uploaded_at: new Date().toISOString(),
    uploaded_by: session.email,
  };
  await attachSalesClientPhoto(clientId, photo);
  return NextResponse.json({ photo }, { status: 201 });
}
