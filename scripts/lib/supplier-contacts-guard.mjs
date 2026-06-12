/**
 * Keep in sync with REQUIRED_FABRIC_SUPPLIER_IDS in src/lib/data/required-fabric-suppliers.ts
 */
export const REQUIRED_FABRIC_SUPPLIER_IDS = [
  "caccioppoli",
  "zegna",
  "drapers",
  "stylbiella",
  "loro-piana",
  "solbiati",
  "canclini",
  "wool-stock",
  "gazaba",
];

export function getMissingRequiredFabricSuppliers(contacts) {
  const present = new Set((contacts?.suppliers ?? []).map((s) => s.id));
  return REQUIRED_FABRIC_SUPPLIER_IDS.filter((id) => !present.has(id));
}

export function validateSupplierContacts(contacts, { throwOnMissing = false } = {}) {
  const missing = getMissingRequiredFabricSuppliers(contacts);
  if (missing.length > 0) {
    const message = `Missing required fabric suppliers: ${missing.join(", ")}`;
    console.error(`[supplier-contacts] ${message}`);
    if (throwOnMissing) {
      throw new Error(message);
    }
  }
  return missing;
}

/** Union by id — later entries overwrite earlier ones on conflict. */
export function mergeSupplierContacts(...files) {
  const byId = new Map();
  let merged = {};

  for (const file of files) {
    if (!file) continue;
    merged = { ...merged, ...file };
    for (const row of file.suppliers ?? []) {
      if (row?.id) byId.set(row.id, row);
    }
  }

  return {
    ...merged,
    suppliers: [...byId.values()],
  };
}

/**
 * Before writing supplier_contacts TO Supabase: merge with existing remote so
 * suppliers absent from the incoming payload are preserved.
 */
export function mergeIncomingWithRemoteSupplierContacts(incoming, remote) {
  if (!remote) return incoming;
  return mergeSupplierContacts(remote, incoming);
}

/**
 * Before overwriting local contacts FROM Supabase: restore required suppliers
 * from local when stale remote data omitted them.
 */
export function protectLocalFromStaleRemoteSupplierContacts(remote, local) {
  const merged = mergeSupplierContacts(remote, local);
  const missing = getMissingRequiredFabricSuppliers(merged);
  return { merged, missing };
}
