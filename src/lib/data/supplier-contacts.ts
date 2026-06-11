import path from "path";
import { resolveFabricSupplierId } from "@/lib/fabric-sourcing/supplier-aliases";
import { readJsonFile, readJsonFileAsync, saveDocument } from "@/lib/data/document-persistence";
import {
  getMissingRequiredFabricSuppliers,
  REQUIRED_FABRIC_SUPPLIER_IDS,
  validateSupplierContacts,
  type RequiredFabricSupplierId,
} from "@/lib/data/required-fabric-suppliers";
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

function normalizeSupplierContacts(data: SupplierContactsFile): SupplierContactsFile {
  return {
    ...data,
    factory_orders_email: data.factory_orders_email ?? null,
    inbox_scan_email: data.inbox_scan_email ?? null,
    suppliers: data.suppliers.map(normalizeContactRow),
  };
}

/** Auto-loads supplier_contacts from Supabase when enabled. */
export async function readSupplierContacts(): Promise<SupplierContactsFile> {
  const data = await readJsonFileAsync(CONTACTS_PATH, EMPTY_CONTACTS);
  return normalizeSupplierContacts(data);
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
  return contacts.suppliers
    .filter((row) => row.id !== "fab6")
    .map((row) => ({
      id: row.id,
      name: row.name,
      has_price_list: Boolean(row.has_price_list),
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
