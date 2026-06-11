import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getFabricSupplierBrands } from "@/lib/data/supplier-contacts";

export async function GET() {
  try {
    await ensureDocumentsLoaded(["supplier_contacts"]);
    const brands = getFabricSupplierBrands();
    return NextResponse.json({ brands });
  } catch (error) {
    console.error("Failed to load fabric brands:", error);
    return NextResponse.json({ error: "Failed to load fabric suppliers." }, { status: 500 });
  }
}
