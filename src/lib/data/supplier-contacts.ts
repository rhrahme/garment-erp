import path from "path";
import { readJsonFile, writeJsonFile } from "@/lib/data/json-file-cache";
import type { Supplier } from "@/lib/types/fabric-sourcing";
import type { SupplierContactRow, SupplierContactsFile } from "@/lib/types/supplier-contacts";

export type { SupplierContactRow, SupplierContactsFile };

const CONTACTS_PATH = path.join(process.cwd(), "src/data/suppliers/contacts.json");
const EMPTY_CONTACTS: SupplierContactsFile = {
  updated_at: null,
  notes: null,
  factory_orders_email: null,
  inbox_scan_email: null,
  suppliers: [],
};

export function readSupplierContacts(): SupplierContactsFile {
  const data = readJsonFile(CONTACTS_PATH, EMPTY_CONTACTS);
  return {
    ...data,
    factory_orders_email: data.factory_orders_email ?? null,
    inbox_scan_email: data.inbox_scan_email ?? null,
    suppliers: data.suppliers.map(normalizeContactRow),
  };
}

export function writeSupplierContacts(data: SupplierContactsFile): SupplierContactsFile {
  const payload: SupplierContactsFile = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  return writeJsonFile(CONTACTS_PATH, payload);
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

export function getAllSuppliersFromContacts(): Supplier[] {
  return readSupplierContacts().suppliers.map(contactToSupplier);
}

export function getSupplierByIdFromContacts(id: string): Supplier | undefined {
  const row = readSupplierContacts().suppliers.find((s) => s.id === id);
  return row ? contactToSupplier(row) : undefined;
}

/** Fabric suppliers for sales orders / fabric search — includes brands without a price list yet. */
export function getFabricSupplierBrands(): Array<{ id: string; name: string; has_price_list: boolean }> {
  return readSupplierContacts()
    .suppliers.filter((row) => row.id !== "fab6")
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
