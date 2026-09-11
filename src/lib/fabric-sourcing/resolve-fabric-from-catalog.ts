import type { FabricSearchItem } from "@/lib/autosave/fabric-search-item";
import { searchSupplierFabrics } from "@/lib/data/supplier-catalogs";
import { getSupplierByIdFromContactsSync } from "@/lib/data/supplier-contacts";
import { fabricNumberMatchesCatalogEntry } from "@/lib/fabric-sourcing/fabric-catalog-number-match";
import {
  expandLoroPianaStyleQuery,
  getLoroPianaMillLine,
  isLoroPianaStyleSupplier,
  normalizeLoroPianaFabricNumber,
  resolveLoroPianaFabricInput,
} from "@/lib/fabric-sourcing/loro-piana-styles";
import { resolveFabricSupplierId } from "@/lib/fabric-sourcing/supplier-aliases";
import { formatFabricSupplierName, normalizeFabricSupplierFields } from "@/lib/fabric-sourcing/supplier-display";
import type { SupplierFabric } from "@/lib/types/fabric-sourcing";

function supplierName(supplierId: string): string {
  return getSupplierByIdFromContactsSync(supplierId)?.name ?? supplierId;
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
    mill_line:
      item.mill_line ??
      (item.supplier_id === "loro-piana" || item.supplier_id === "solbiati"
        ? getLoroPianaMillLine(item.fabric_number)
        : null),
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

function findExactCatalogMatch(supplierId: string, fabricNumber: string): FabricSearchItem | null {
  const trimmed = fabricNumber.trim();
  const canonicalId = resolveFabricSupplierId(supplierId);
  const catalogMatches = searchSupplierFabrics(canonicalId, trimmed, 20);
  const items = catalogMatches.map((item) => toSearchItem(item, false));

  const usesLpStyleInput = isLoroPianaStyleSupplier(canonicalId);
  const lookupNumber = usesLpStyleInput
    ? normalizeLoroPianaFabricNumber(trimmed).toLowerCase()
    : trimmed.toLowerCase();

  const exact =
    items.find((item) => !item.manual && item.fabric_number.toLowerCase() === lookupNumber) ??
    items.find((item) => item.fabric_number.toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;

  // A range row ("50021-50034") carries the specs and price for every number in
  // it. Keep the number that was actually entered: the range is price-list
  // shorthand and must never reach a sticker, a PO or an invoice.
  const inRange = items.find((item) =>
    fabricNumberMatchesCatalogEntry(lookupNumber, item.fabric_number)
  );
  if (inRange) return { ...inRange, fabric_number: trimmed };

  return null;
}

/** Server-side fabric lookup — mirrors /api/fabric-search for order line updates. */
export function resolveFabricItemFromCatalog(
  supplierId: string,
  fabricNumber: string
): FabricSearchItem {
  const trimmed = fabricNumber.trim();
  const canonicalId = resolveFabricSupplierId(supplierId);
  const match = findExactCatalogMatch(canonicalId, trimmed);
  if (match) return match;

  // Loro Piana account orders include Solbiati linens (S-prefix) from the same price list.
  if (canonicalId === "loro-piana" && getLoroPianaMillLine(trimmed) === "solbiati") {
    const solbiatiMatch = findExactCatalogMatch("solbiati", trimmed);
    if (solbiatiMatch) return solbiatiMatch;
  }

  const usesLpStyleInput = isLoroPianaStyleSupplier(canonicalId);

  if (trimmed) {
    const rangeMatch = usesLpStyleInput && expandLoroPianaStyleQuery(trimmed).length > 1;
    if (!rangeMatch) {
      if (usesLpStyleInput) {
        const resolved = resolveLoroPianaFabricInput(trimmed);
        const allowManual =
          canonicalId === "solbiati"
            ? resolved.millLine === "solbiati"
            : resolved.millLine === "loro_piana";
        if (allowManual) {
          const manual = buildManualFabricEntry(canonicalId, resolved.preferredNumber);
          manual.mill_line = resolved.millLine;
          return manual;
        }
      } else {
        return buildManualFabricEntry(canonicalId, trimmed);
      }
    }
  }

  return buildManualFabricEntry(canonicalId, trimmed);
}
