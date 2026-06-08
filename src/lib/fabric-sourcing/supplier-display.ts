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

export function fabricSupplierGroupKey(supplierId: string, fabricNumber: string): string {
  const poId = fabricPoSupplierId(supplierId, fabricNumber);
  const line = isSolbiatiFabric(supplierId, fabricNumber) ? "solbiati" : "main";
  return `${poId}:${line}`;
}
