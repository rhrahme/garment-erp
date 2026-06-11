import { NextResponse } from "next/server";
import { getFabricSupplierBrands } from "@/lib/data/supplier-contacts";

export async function GET() {
  try {
    const brands = await getFabricSupplierBrands();
    return NextResponse.json({ brands });
  } catch (error) {
    console.error("Failed to load fabric brands:", error);
    return NextResponse.json({ error: "Failed to load fabric suppliers." }, { status: 500 });
  }
}
