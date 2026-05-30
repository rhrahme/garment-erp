import { NextResponse } from "next/server";
import { getFactoryBrands } from "@/lib/data/factory-brands";
import { verifyApiKey } from "@/lib/integrations/api-auth";

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  return NextResponse.json({ brands: getFactoryBrands() });
}
