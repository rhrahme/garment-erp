import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { listEntityAlbums, readEntityImages } from "@/lib/data/entity-images";
import {
  entityRefsFromContext,
  parseEntityKey,
} from "@/lib/entity-images/keys";

/** Zapier parity: list fabric / garment / article photo albums. */
export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
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
    inventoryItemId: url.searchParams.get("inventory_item_id"),
    payrollAdjustmentId: url.searchParams.get("payroll_adjustment_id"),
  }).map((ref) => ref.key);
  const keys = [...rawKeys, ...fromParts]
    .map((key) => parseEntityKey(key)?.key)
    .filter((key): key is string => Boolean(key));

  const store = await readEntityImages();
  return NextResponse.json({
    albums: keys.length ? listEntityAlbums(store, keys) : store.albums,
  });
}
