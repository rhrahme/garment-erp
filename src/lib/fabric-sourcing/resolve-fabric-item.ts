import type { FabricSearchItem } from "@/lib/autosave/fabric-search-item";
import { isLoroPianaStyleSupplier, normalizeLoroPianaFabricNumber } from "@/lib/fabric-sourcing/loro-piana-styles";
import { normalizeFabricSupplierFields } from "@/lib/fabric-sourcing/supplier-display";

export async function resolveFabricItem(
  supplierId: string,
  supplierName: string,
  fabricNumber: string
): Promise<FabricSearchItem> {
  const trimmed = fabricNumber.trim();
  const params = new URLSearchParams({
    supplier_id: supplierId,
    q: trimmed,
    limit: "20",
  });
  const res = await fetch(`/api/fabric-search?${params}`);
  if (res.ok) {
    const data = (await res.json()) as { items: FabricSearchItem[] };
    const lookup = isLoroPianaStyleSupplier(supplierId)
      ? normalizeLoroPianaFabricNumber(trimmed)
      : trimmed;
    const match =
      data.items.find(
        (item) => !item.manual && item.fabric_number.toLowerCase() === lookup.toLowerCase()
      ) ??
      data.items.find((item) => item.fabric_number.toLowerCase() === trimmed.toLowerCase());
    if (match) return match;
  }

  const normalized = normalizeFabricSupplierFields(supplierId, supplierName, trimmed);
  return {
    id: `manual-${normalized.supplier_id}-${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    supplier_id: normalized.supplier_id,
    supplier_name: normalized.supplier_name,
    fabric_number: trimmed,
    composition: null,
    color: null,
    weight_gsm: null,
    width_cm: null,
    width_inches: null,
    unit_price: null,
    unit: "meters",
    mill_line: normalized.supplier_name === "Solbiati" ? "solbiati" : null,
    manual: true,
  };
}
