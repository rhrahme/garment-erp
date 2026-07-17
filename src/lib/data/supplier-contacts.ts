import path from "path";
import { resolveFabricSupplierId } from "@/lib/fabric-sourcing/supplier-aliases";
import { readJsonFile, readJsonFileAsync, saveDocument } from "@/lib/data/document-persistence";
import {
  getMissingRequiredFabricSuppliers,
  REQUIRED_FABRIC_SUPPLIER_IDS,
  validateSupplierContacts,
  type RequiredFabricSupplierId,
} from "@/lib/data/required-fabric-suppliers";
import { CUSTOM_SUPPLIER_ID, CUSTOM_SUPPLIER_NAME } from "@/lib/types/custom-fabrics";
import type { Supplier } from "@/lib/types/fabric-sourcing";
import type { SupplierContactRow, SupplierContactsFile } from "@/lib/types/supplier-contacts";

export type { SupplierContactRow, SupplierContactsFile };
export {
  getMissingRequiredFabricSuppliers,
  REQUIRED_FABRIC_SUPPLIER_IDS,
  validateSupplierContacts,
  type RequiredFabricSupplierId,
};

const CONTACTS_PATH = path.join(process.cwd(), "src/data/suppliers/contacts.json");
const EMPTY_CONTACTS: SupplierContactsFile = {
  updated_at: null,
  notes: null,
  factory_orders_email: null,
  inbox_scan_email: null,
  suppliers: [],
};

/**
 * The Custom / One-off brand as a supplier-contacts row. Kept in sync with the
 * bundled contacts.json entry so JSON mode and Supabase mode agree.
 */
export const CUSTOM_SUPPLIER_CONTACT: SupplierContactRow = {
  id: CUSTOM_SUPPLIER_ID,
  code: "CUSTOM",
  name: CUSTOM_SUPPLIER_NAME,
  country: null,
  contact_person: null,
  emails: [],
  email: null,
  lead_time_days: 0,
  has_price_list: true,
  currency: "EUR",
  notes:
    "One-off fabrics (CF-YYYY-####) — mill leftovers, shop buys, client swatches. Created in Fabric Specification.",
};

/**
 * Guarantee the Custom / One-off supplier is present. Production reads suppliers
 * from the Supabase `supplier_contacts` document, which predates the custom
 * feature and may omit it — merge it in so the brand list, the data-integrity
 * check, and order-save validation always treat "custom" as a real supplier.
 */
export function ensureCustomSupplierContactPresent(
  contacts: SupplierContactsFile
): SupplierContactsFile {
  if (contacts.suppliers.some((row) => row.id === CUSTOM_SUPPLIER_ID)) {
    return contacts;
  }
  return { ...contacts, suppliers: [...contacts.suppliers, CUSTOM_SUPPLIER_CONTACT] };
}

function normalizeSupplierContacts(data: SupplierContactsFile): SupplierContactsFile {
  return ensureCustomSupplierContactPresent({
    ...data,
    factory_orders_email: data.factory_orders_email ?? null,
    inbox_scan_email: data.inbox_scan_email ?? null,
    suppliers: data.suppliers.map(normalizeContactRow),
  });
}

/** Catalog import wins over stale Supabase has_price_list:false flags. */
async function applyImportedCatalogPriceListFlags(
  contacts: SupplierContactsFile
): Promise<SupplierContactsFile> {
  const { supplierHasImportedCatalog } = await import("@/lib/data/supplier-catalogs");
  let changed = false;
  const suppliers = contacts.suppliers.map((row) => {
    if (row.has_price_list || !supplierHasImportedCatalog(row.id)) return row;
    changed = true;
    return { ...row, has_price_list: true };
  });
  return changed ? { ...contacts, suppliers } : contacts;
}

/** Auto-loads supplier_contacts from Supabase when enabled. */
export async function readSupplierContacts(): Promise<SupplierContactsFile> {
  const data = await readJsonFileAsync(CONTACTS_PATH, EMPTY_CONTACTS);
  return applyImportedCatalogPriceListFlags(normalizeSupplierContacts(data));
}

/** Sync read — only after ensureDocumentsLoaded(["supplier_contacts"]) or readSupplierContacts(). */
export function readSupplierContactsSync(): SupplierContactsFile {
  return normalizeSupplierContacts(readJsonFile(CONTACTS_PATH, EMPTY_CONTACTS));
}

export async function writeSupplierContacts(data: SupplierContactsFile): Promise<SupplierContactsFile> {
  validateSupplierContacts(data, { throwOnMissing: true });
  const payload: SupplierContactsFile = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  return saveDocument(CONTACTS_PATH, payload);
}

export function normalizeEmailList(
  emails: unknown,
  legacyEmail?: string | null
): string[] {
  const parsed = Array.isArray(emails)
    ? emails.map((value) => normalizeEmail(String(value))).filter((value): value is string => Boolean(value))
    : [];

  if (parsed.length > 0) {
    return [...new Set(parsed)];
  }

  const single = normalizeEmail(legacyEmail);
  return single ? [single] : [];
}

export function formatEmailList(emails: string[]): string {
  return emails.join(", ");
}

export function contactToSupplier(row: SupplierContactRow): Supplier {
  const emails = normalizeEmailList(row.emails, row.email);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    contact_person: row.contact_person,
    email: emails.length > 0 ? formatEmailList(emails) : null,
    emails,
    country: row.country,
    is_fabric_supplier: true,
    lead_time_days: row.lead_time_days,
  };
}

export function normalizeContactRow(row: SupplierContactRow): SupplierContactRow {
  const emails = normalizeEmailList(row.emails, row.email);
  return {
    ...row,
    emails,
    email: emails.length > 0 ? formatEmailList(emails) : null,
  };
}

export async function getAllSuppliersFromContacts(): Promise<Supplier[]> {
  const contacts = await readSupplierContacts();
  return contacts.suppliers.map(contactToSupplier);
}

export async function getSupplierByIdFromContacts(id: string): Promise<Supplier | undefined> {
  const canonicalId = resolveFabricSupplierId(id);
  const contacts = await readSupplierContacts();
  const row = contacts.suppliers.find((s) => s.id === canonicalId);
  return row ? contactToSupplier(row) : undefined;
}

/** Sync lookup — only after ensureDocumentsLoaded(["supplier_contacts"]) or readSupplierContacts(). */
export function getSupplierByIdFromContactsSync(id: string): Supplier | undefined {
  const canonicalId = resolveFabricSupplierId(id);
  const row = readSupplierContactsSync().suppliers.find((s) => s.id === canonicalId);
  return row ? contactToSupplier(row) : undefined;
}

/** Fabric suppliers for sales orders / fabric search — includes brands without a price list yet. */
export async function getFabricSupplierBrands(): Promise<
  Array<{ id: string; name: string; has_price_list: boolean }>
> {
  const contacts = await readSupplierContacts();
  const { supplierHasImportedCatalog } = await import("@/lib/data/supplier-catalogs");
  return contacts.suppliers
    .filter((row) => row.id !== "fab6")
    .map((row) => ({
      id: row.id,
      name: row.name,
      has_price_list: Boolean(row.has_price_list) || supplierHasImportedCatalog(row.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
