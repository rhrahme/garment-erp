import { NextResponse } from "next/server";
import { buildFabricCatalogHealthPayload } from "@/lib/health/fabric-catalog-health";

/**
 * Public smoke check — catalog JSON is bundled and sample lookups resolve.
 * Must never return monetary values (endpoint is unauthenticated under /api/v1/).
 */
export async function GET() {
  try {
    return NextResponse.json(buildFabricCatalogHealthPayload());
  } catch (error) {
    console.error("Health fabric catalog check failed:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to verify supplier catalog" },
      { status: 500 }
    );
  }
}
