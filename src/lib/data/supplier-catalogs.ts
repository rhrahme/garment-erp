export * from "@/lib/data/supplier-catalog-data";
import type { SupplierContactRow } from "@/lib/types/supplier-contacts";
import type { Supplier, SupplierFabric } from "@/lib/types/fabric-sourcing";

/** Server-side helpers that join bundled catalogs with live supplier contacts. */

export async function getFactoryOrdersEmail(): Promise<string | null> {
  const { readSupplierContacts } = await import("@/lib/data/supplier-contacts");
  const contacts = await readSupplierContacts();
  return contacts.factory_orders_email;
}

export async function getInboxScanEmailFromContacts(): Promise<string | null> {
  const { readSupplierContacts } = await import("@/lib/data/supplier-contacts");
  const contacts = await readSupplierContacts();
  return contacts.inbox_scan_email;
}

export async function getSupplierContacts(): Promise<SupplierContactRow[]> {
  const { readSupplierContacts } = await import("@/lib/data/supplier-contacts");
  const contacts = await readSupplierContacts();
  return contacts.suppliers;
}

export async function getSupplierById(id: string): Promise<Supplier | undefined> {
  const { getSupplierByIdFromContacts } = await import("@/lib/data/supplier-contacts");
  return getSupplierByIdFromContacts(id);
}

export async function attachLiveSupplierContacts(fabrics: SupplierFabric[]): Promise<SupplierFabric[]> {
  const { getAllSuppliersFromContacts } = await import("@/lib/data/supplier-contacts");
  const suppliers = new Map((await getAllSuppliersFromContacts()).map((supplier) => [supplier.id, supplier]));
  return fabrics.map((fabric) => ({
    ...fabric,
    supplier: suppliers.get(fabric.supplier_id) ?? fabric.supplier,
  }));
}

export async function getImportedSuppliers(): Promise<Supplier[]> {
  const { getAllSuppliersFromContacts } = await import("@/lib/data/supplier-contacts");
  return getAllSuppliersFromContacts();
}
