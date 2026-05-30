import { NextResponse } from "next/server";
import { getFabricSupplierBrands } from "@/lib/data/supplier-contacts";

export async function GET() {
  const brands = getFabricSupplierBrands();
  return NextResponse.json({ brands });
}
