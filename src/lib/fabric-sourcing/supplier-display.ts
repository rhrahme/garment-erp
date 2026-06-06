import { getLoroPianaMillLine } from "@/lib/fabric-sourcing/loro-piana-styles";

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
  return supplierName;
}

/** Solbiati ships on the Loro Piana supplier account — one PO contact. */
export function fabricPoSupplierId(supplierId: string, fabricNumber: string): string {
  if (supplierId === "solbiati" || (supplierId === "loro-piana" && isSolbiatiFabric(supplierId, fabricNumber))) {
    return "loro-piana";
  }
  return supplierId;
}

export function normalizeFabricSupplierFields(
  supplierId: string,
  supplierName: string,
  fabricNumber: string
): { supplier_id: string; supplier_name: string } {
  const poSupplierId = fabricPoSupplierId(supplierId, fabricNumber);
  return {
    supplier_id: poSupplierId,
    supplier_name: formatFabricSupplierName(supplierId, supplierName, fabricNumber),
  };
}

export function fabricSupplierGroupKey(supplierId: string, fabricNumber: string): string {
  const poId = fabricPoSupplierId(supplierId, fabricNumber);
  const line = isSolbiatiFabric(supplierId, fabricNumber) ? "solbiati" : "main";
  return `${poId}:${line}`;
}
