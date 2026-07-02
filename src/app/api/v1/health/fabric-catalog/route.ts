import { NextResponse } from "next/server";
import { searchSupplierFabrics } from "@/lib/data/supplier-catalogs";
import { isSupplierCatalogReady } from "@/lib/sales-orders/fabric-cost";

/** Public smoke check — supplier catalog JSON is bundled and Solbiati prices resolve. */
export async function GET() {
  try {
    const catalogReady = isSupplierCatalogReady();
    const solbiatiSample = searchSupplierFabrics("solbiati", "S10005", 1)[0] ?? null;
    const loroPianaSolbiatiSample = searchSupplierFabrics("loro-piana", "S10005", 1)[0] ?? null;

    return NextResponse.json({
      ok: catalogReady && solbiatiSample?.unit_price != null,
      catalog_ready: catalogReady,
      solbiati_fabric_count: searchSupplierFabrics("solbiati", "", 1_000).length,
      sample: {
        fabric_number: "S10005",
        solbiati_unit_price: solbiatiSample?.unit_price ?? null,
        loro_piana_lookup_unit_price: loroPianaSolbiatiSample?.unit_price ?? null,
      },
    });
  } catch (error) {
    console.error("Health fabric catalog check failed:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to verify supplier catalog" },
      { status: 500 }
    );
  }
}
