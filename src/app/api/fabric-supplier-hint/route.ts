import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { getFabricSupplierMismatchHint } from "@/lib/fabric-sourcing/fabric-catalog-owner";
import { getSupplierByIdFromContactsSync } from "@/lib/data/supplier-contacts";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";

export async function GET(request: Request) {
  await ensureDocumentsLoaded(["supplier_contacts"]);
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const fabricNumber = url.searchParams.get("fabric_number")?.trim() ?? "";
  const selectedSupplierId = url.searchParams.get("supplier_id")?.trim() ?? "";

  if (!fabricNumber || !selectedSupplierId) {
    return NextResponse.json({ hint: null });
  }

  const selectedName =
    getSupplierByIdFromContactsSync(selectedSupplierId)?.name ?? selectedSupplierId;
  const hint = getFabricSupplierMismatchHint(selectedSupplierId, selectedName, fabricNumber);

  return NextResponse.json({ hint });
}
