/** Fabric suppliers that must never disappear from contacts. */
export const REQUIRED_FABRIC_SUPPLIER_IDS = [
  "caccioppoli",
  "zegna",
  "drapers",
  "stylbiella",
  "loro-piana",
  "solbiati",
  "canclini",
  "wool-stock",
] as const;

export type RequiredFabricSupplierId = (typeof REQUIRED_FABRIC_SUPPLIER_IDS)[number];

export type SupplierContactsLike = {
  suppliers: Array<{ id: string }>;
};

export function getMissingRequiredFabricSuppliers(contacts: SupplierContactsLike): string[] {
  const present = new Set(contacts.suppliers.map((s) => s.id));
  return REQUIRED_FABRIC_SUPPLIER_IDS.filter((id) => !present.has(id));
}

/** Logs missing required suppliers; optionally throws (used by write paths). */
export function validateSupplierContacts(
  contacts: SupplierContactsLike,
  options?: { throwOnMissing?: boolean }
): string[] {
  const missing = getMissingRequiredFabricSuppliers(contacts);
  if (missing.length > 0) {
    const message = `Missing required fabric suppliers: ${missing.join(", ")}`;
    console.error(`[supplier-contacts] ${message}`);
    if (options?.throwOnMissing) {
      throw new Error(message);
    }
  }
  return missing;
}
