import {
  loroPianaFabrics,
  searchSupplierFabrics,
  solbiatiFabrics,
} from "@/lib/data/supplier-catalog-data";
import { toPublicFabricCatalogHealthSample } from "@/lib/health/fabric-catalog-health-public";

export { toPublicFabricCatalogHealthSample };

/**
 * Public smoke-check payload for /api/v1/health/fabric-catalog.
 * Returns only booleans for price presence — never monetary values.
 */
export function buildFabricCatalogHealthPayload() {
  const catalogReady = solbiatiFabrics.length > 0 && loroPianaFabrics.length > 0;
  const solbiatiSample = searchSupplierFabrics("solbiati", "S10005", 1)[0] ?? null;
  const loroPianaSolbiatiSample = searchSupplierFabrics("loro-piana", "S10005", 1)[0] ?? null;
  const sample = toPublicFabricCatalogHealthSample({
    fabric_number: "S10005",
    solbiatiUnitPrice: solbiatiSample?.unit_price,
    loroPianaLookupUnitPrice: loroPianaSolbiatiSample?.unit_price,
  });

  return {
    ok: catalogReady && sample.solbiati_has_unit_price,
    catalog_ready: catalogReady,
    solbiati_fabric_count: searchSupplierFabrics("solbiati", "", 1_000).length,
    sample,
  };
}
