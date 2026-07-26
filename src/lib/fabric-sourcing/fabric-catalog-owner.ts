import {
  expandLoroPianaFabricNumberCandidates,
  formatLoroPianaMillLineLabel,
  getLoroPianaMillLine,
  isLoroPianaStyleSupplier,
} from "@/lib/fabric-sourcing/loro-piana-styles";
import { fabricNumberMatchesCatalogEntry } from "@/lib/fabric-sourcing/fabric-catalog-number-match";
import {
  resolveFabricSupplierDisplayName,
  resolveFabricSupplierId,
} from "@/lib/fabric-sourcing/supplier-aliases";
import { getFabricsBySupplierId } from "@/lib/data/supplier-catalog-data";

const CATALOG_SUPPLIER_IDS = [
  "caccioppoli",
  "zegna",
  "drapers",
  "stylbiella",
  "loro-piana",
  "solbiati",
  "canclini",
  "wool-stock",
  "gazaba",
] as const;

const SUPPLIER_LABELS: Record<string, string> = {
  caccioppoli: "Caccioppoli",
  zegna: "Zegna",
  drapers: "Drapers",
  stylbiella: "Stylbiella",
  "loro-piana": "Loro Piana",
  solbiati: "Solbiati",
  canclini: "Canclini",
  "wool-stock": "Wool Stock",
  gazaba: "Gazaba",
};

function catalogOwnerLabel(supplierId: string, _fabricNumber: string): string {
  return resolveFabricSupplierDisplayName(
    supplierId,
    SUPPLIER_LABELS[resolveFabricSupplierId(supplierId)] ?? supplierId
  );
}

/** Which imported price-list supplier owns this fabric number, if any. */
export function findFabricCatalogOwner(fabricNumber: string): {
  supplier_id: string;
  supplier_name: string;
} | null {
  const trimmed = fabricNumber.trim();
  if (!trimmed) return null;

  const candidates = new Set<string>([trimmed, trimmed.toUpperCase()]);
  for (const candidate of expandLoroPianaFabricNumberCandidates(trimmed)) {
    candidates.add(candidate);
    candidates.add(candidate.toUpperCase());
  }

  for (const supplierId of CATALOG_SUPPLIER_IDS) {
    for (const fabric of getFabricsBySupplierId(supplierId)) {
      for (const candidate of candidates) {
        if (!fabricNumberMatchesCatalogEntry(candidate, fabric.fabric_number)) continue;

        if (supplierId === "loro-piana" || supplierId === "solbiati") {
          const millLine = getLoroPianaMillLine(fabric.fabric_number);
          const ownerId = millLine === "solbiati" ? "solbiati" : "loro-piana";
          return {
            supplier_id: ownerId,
            supplier_name: formatLoroPianaMillLineLabel(millLine),
          };
        }

        return {
          supplier_id: supplierId,
          supplier_name: catalogOwnerLabel(supplierId, fabric.fabric_number),
        };
      }
    }
  }

  return null;
}

/** True when the selected supplier matches the catalog owner for this fabric. */
export function fabricSupplierMatchesCatalog(
  selectedSupplierId: string,
  fabricNumber: string,
  owner?: { supplier_id: string } | null
): boolean {
  const resolvedSelected = resolveFabricSupplierId(selectedSupplierId);
  const catalogOwner = owner ?? findFabricCatalogOwner(fabricNumber);
  if (!catalogOwner) return true;

  const resolvedOwner = resolveFabricSupplierId(catalogOwner.supplier_id);
  if (resolvedSelected === resolvedOwner) return true;

  if (isLoroPianaStyleSupplier(resolvedSelected) && isLoroPianaStyleSupplier(resolvedOwner)) {
    const selectedMill =
      resolvedSelected === "solbiati" ? "solbiati" : getLoroPianaMillLine(fabricNumber);
    const ownerMill = resolvedOwner === "solbiati" ? "solbiati" : getLoroPianaMillLine(fabricNumber);
    return selectedMill === ownerMill;
  }

  return false;
}

export type FabricSupplierMismatchHint = {
  mismatch: true;
  fabric_number: string;
  selected_supplier_id: string;
  selected_supplier_name: string;
  suggested_supplier_id: string;
  suggested_supplier_name: string;
  message: string;
};

export function getFabricSupplierMismatchHint(
  selectedSupplierId: string,
  selectedSupplierName: string,
  fabricNumber: string
): FabricSupplierMismatchHint | null {
  const trimmed = fabricNumber.trim();
  if (!trimmed || !selectedSupplierId.trim()) return null;

  const owner = findFabricCatalogOwner(trimmed);
  if (!owner) return null;

  if (fabricSupplierMatchesCatalog(selectedSupplierId, trimmed, owner)) return null;

  const selectedLabel = catalogOwnerLabel(selectedSupplierId, trimmed);
  const message = `This fabric number looks like ${owner.supplier_name}, not ${selectedLabel} — switch supplier?`;

  return {
    mismatch: true,
    fabric_number: trimmed,
    selected_supplier_id: resolveFabricSupplierId(selectedSupplierId),
    selected_supplier_name: selectedLabel,
    suggested_supplier_id: owner.supplier_id,
    suggested_supplier_name: owner.supplier_name,
    message,
  };
}
