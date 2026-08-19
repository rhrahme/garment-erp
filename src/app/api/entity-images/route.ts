import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { listEntityAlbums, readEntityImages } from "@/lib/data/entity-images";
import {
  entityRefsFromContext,
  parseEntityKey,
} from "@/lib/entity-images/keys";

export async function GET(request: Request) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureDocumentsLoaded(["entity_images"]);

  const url = new URL(request.url);
  const rawKeys = url.searchParams.getAll("keys").flatMap((value) =>
    value.split(",").map((part) => part.trim()).filter(Boolean)
  );
  const fromParts = entityRefsFromContext({
    supplierId: url.searchParams.get("supplier_id"),
    fabricNumber: url.searchParams.get("fabric_number"),
    garmentType: url.searchParams.get("garment_type"),
    salesOrderLineId: url.searchParams.get("sales_order_line_id"),
  }).map((ref) => ref.key);
  const keys = [...rawKeys, ...fromParts]
    .map((key) => parseEntityKey(key)?.key)
    .filter((key): key is string => Boolean(key));

  const store = await readEntityImages();
  return NextResponse.json({ albums: listEntityAlbums(store, keys) });
}
