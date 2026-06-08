import type { FabricSearchItem } from "@/lib/autosave/fabric-search-item";
import { searchSupplierFabrics } from "@/lib/data/supplier-catalogs";
import { getSupplierByIdFromContacts } from "@/lib/data/supplier-contacts";
import {
  expandLoroPianaStyleQuery,
  getLoroPianaMillLine,
  normalizeLoroPianaFabricNumber,
  resolveLoroPianaFabricInput,
} from "@/lib/fabric-sourcing/loro-piana-styles";
import { resolveFabricSupplierId } from "@/lib/fabric-sourcing/supplier-aliases";
import { formatFabricSupplierName, normalizeFabricSupplierFields } from "@/lib/fabric-sourcing/supplier-display";
import type { SupplierFabric } from "@/lib/types/fabric-sourcing";

function supplierName(supplierId: string): string {
  return getSupplierByIdFromContacts(supplierId)?.name ?? supplierId;
}

function toSearchItem(item: SupplierFabric, manual = false): FabricSearchItem {
  return {
    id: item.id,
    supplier_id: item.supplier_id,
    supplier_name: formatFabricSupplierName(item.supplier_id, supplierName(item.supplier_id), item.fabric_number),
    fabric_number: item.fabric_number,
    composition: item.composition,
    color: item.color,
    weight_gsm: item.weight_gsm,
    width_cm: item.width_cm,
    width_inches: item.width_inches,
    unit_price: item.unit_price,
    unit: item.unit,
    stock_status: item.stock_status ?? null,
    restock_date: item.restock_date ?? null,
    mill_line: item.mill_line ?? (item.supplier_id === "loro-piana" ? getLoroPianaMillLine(item.fabric_number) : null),
    manual,
  };
}

function buildManualFabricEntry(supplierId: string, fabricNumber: string): FabricSearchItem {
  const trimmed = fabricNumber.trim();
  const normalized = normalizeFabricSupplierFields(supplierId, supplierName(supplierId), trimmed);
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
    stock_status: null,
    restock_date: null,
    mill_line: normalized.supplier_name === "Solbiati" ? "solbiati" : null,
    manual: true,
  };
}

/** Server-side fabric lookup — mirrors /api/fabric-search for order line updates. */
export function resolveFabricItemFromCatalog(
  supplierId: string,
  fabricNumber: string
): FabricSearchItem {
  const trimmed = fabricNumber.trim();
  const canonicalId = resolveFabricSupplierId(supplierId);
  const catalogMatches = searchSupplierFabrics(canonicalId, trimmed, 20);
  const items = catalogMatches.map((item) => toSearchItem(item, false));

  const lookupNumber =
    canonicalId === "loro-piana"
      ? normalizeLoroPianaFabricNumber(trimmed).toLowerCase()
      : trimmed.toLowerCase();
  const match =
    items.find((item) => !item.manual && item.fabric_number.toLowerCase() === lookupNumber) ??
    items.find((item) => item.fabric_number.toLowerCase() === trimmed.toLowerCase());
  if (match) return match;

  if (trimmed) {
    const rangeMatch = canonicalId === "loro-piana" && expandLoroPianaStyleQuery(trimmed).length > 1;
    if (!rangeMatch) {
      const resolved = resolveLoroPianaFabricInput(trimmed);
      const manualNumber = canonicalId === "loro-piana" ? resolved.preferredNumber : trimmed;
      const manual = buildManualFabricEntry(canonicalId, manualNumber);
      if (canonicalId === "loro-piana") {
        manual.mill_line = resolved.millLine;
      }
      return manual;
    }
  }

  return buildManualFabricEntry(canonicalId, trimmed);
}
