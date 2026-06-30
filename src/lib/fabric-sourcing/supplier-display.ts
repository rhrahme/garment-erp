import { getLoroPianaMillLine } from "@/lib/fabric-sourcing/loro-piana-styles";
import {
  resolveFabricSupplierDisplayName,
  resolveFabricSupplierId,
} from "@/lib/fabric-sourcing/supplier-aliases";

export function isSolbiatiFabric(supplierId: string, fabricNumber: string): boolean {
  if (supplierId === "solbiati") return true;
  if (supplierId === "loro-piana") return getLoroPianaMillLine(fabricNumber) === "solbiati";
  return /^S/i.test(fabricNumber.trim());
}

/** Display name on orders, receiving, production, stickers — not the PO email header. */
export function formatFabricSupplierName(
  supplierId: string,
  supplierName: string,
  fabricNumber: string
): string {
  if (isSolbiatiFabric(supplierId, fabricNumber)) return "Solbiati";
  return resolveFabricSupplierDisplayName(supplierId, supplierName);
}

/** Solbiati ships on the Loro Piana supplier account — one PO contact. */
export function fabricPoSupplierId(supplierId: string, fabricNumber: string): string {
  const resolvedId = resolveFabricSupplierId(supplierId);
  if (resolvedId === "solbiati" || (resolvedId === "loro-piana" && isSolbiatiFabric(resolvedId, fabricNumber))) {
    return "loro-piana";
  }
  return resolvedId;
}

export function normalizeFabricSupplierFields(
  supplierId: string,
  supplierName: string,
  fabricNumber: string
): { supplier_id: string; supplier_name: string } {
  const canonicalId = resolveFabricSupplierId(supplierId);
  const poSupplierId = fabricPoSupplierId(canonicalId, fabricNumber);
  return {
    supplier_id: poSupplierId,
    supplier_name: formatFabricSupplierName(canonicalId, supplierName, fabricNumber),
  };
}

/** Solbiati + Loro Piana share one factory inbox — one PO and one supplier email. */
export const LORO_PIANA_FACTORY_SUPPLIER_IDS = ["loro-piana", "solbiati"] as const;

export function isLoroPianaFactorySupplier(supplierId: string): boolean {
  return (LORO_PIANA_FACTORY_SUPPLIER_IDS as readonly string[]).includes(supplierId);
}

/** Email batch grouping — merges Solbiati POs with Loro Piana. */
export function supplierEmailBatchKey(supplierId: string): string {
  return isLoroPianaFactorySupplier(supplierId) ? "loro-piana" : supplierId;
}

/** Price-list supplier ids to load when building a supplier email batch. */
export function fabricCatalogSupplierIdsForEmail(supplierId: string): string[] {
  if (isLoroPianaFactorySupplier(supplierId)) {
    return [...LORO_PIANA_FACTORY_SUPPLIER_IDS];
  }
  return [supplierId];
}

/** UI/PDF grouping by brand tab — Solbiati vs Loro Piana wool/cashmere. */
export function fabricSupplierGroupKey(supplierId: string, fabricNumber: string): string {
  const poId = fabricPoSupplierId(supplierId, fabricNumber);
  const line = isSolbiatiFabric(supplierId, fabricNumber) ? "solbiati" : "main";
  return `${poId}:${line}`;
}

/** @deprecated Legacy mill-line group keys — always resolves to the Loro Piana PO account. */
export function fabricPoSupplierIdForGroup(groupKey: string): string {
  const [poSupplierId, millLine] = groupKey.split(":");
  if (millLine === "solbiati" || millLine === "main") {
    return "loro-piana";
  }
  return poSupplierId ?? groupKey;
}

/** Allow manual fabric entry when a number is not found in the catalog search. */
export function fabricBrandAllowsManualEntry(
  _hasPriceList: boolean | undefined,
  _supplierId: string
): boolean {
  return true;
}
