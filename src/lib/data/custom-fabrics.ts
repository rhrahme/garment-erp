import path from "path";
import {
  ensureDocumentsLoaded,
  readJsonFile,
  readJsonFileAsync,
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
import {
  generateCustomFabricId,
  generateCustomFabricNumber,
  validateCreateCustomFabricInput,
} from "@/lib/fabric-sourcing/custom-fabric-number";
import {
  CUSTOM_SUPPLIER_ID,
  CUSTOM_SUPPLIER_NAME,
  type CreateCustomFabricInput,
  type CustomFabric,
  type CustomFabricsFile,
} from "@/lib/types/custom-fabrics";
import type { Supplier, SupplierFabric } from "@/lib/types/fabric-sourcing";

export { CUSTOM_SUPPLIER_ID, CUSTOM_SUPPLIER_NAME };
export {
  generateCustomFabricId,
  generateCustomFabricNumber,
  validateCreateCustomFabricInput,
};

const CUSTOM_FABRICS_PATH = path.join(process.cwd(), "src/data/custom-fabrics.json");

const EMPTY: CustomFabricsFile = { updated_at: null, fabrics: [] };

export const CUSTOM_SUPPLIER: Supplier = {
  id: CUSTOM_SUPPLIER_ID,
  code: "CUSTOM",
  name: CUSTOM_SUPPLIER_NAME,
  contact_person: null,
  email: null,
  emails: [],
  country: null,
  is_fabric_supplier: true,
  lead_time_days: 0,
};

/**
 * Guarantee the Custom / One-off brand is always present in a supplier list.
 * The bundled contacts.json seeds it, but production reads suppliers from the
 * Supabase `supplier_contacts` document, which predates the custom feature and
 * may not include it. Merge it in code so the brand tab (and its Create fabric
 * button) is always reachable, even with zero custom fabrics yet.
 */
export function ensureCustomSupplierPresent(suppliers: Supplier[]): Supplier[] {
  if (suppliers.some((supplier) => supplier.id === CUSTOM_SUPPLIER_ID)) {
    return suppliers;
  }
  return [...suppliers, CUSTOM_SUPPLIER];
}

export function readCustomFabrics(): CustomFabricsFile {
  return readJsonFile(CUSTOM_FABRICS_PATH, EMPTY);
}

export async function readCustomFabricsAsync(): Promise<CustomFabricsFile> {
  return readJsonFileAsync(CUSTOM_FABRICS_PATH, EMPTY);
}

export async function readCustomFabricsFresh(): Promise<CustomFabricsFile> {
  return readJsonFileFreshAsync(CUSTOM_FABRICS_PATH, EMPTY);
}

export async function writeCustomFabrics(data: CustomFabricsFile): Promise<CustomFabricsFile> {
  const payload: CustomFabricsFile = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  return saveDocument(CUSTOM_FABRICS_PATH, payload);
}

export async function ensureCustomFabricsLoaded(): Promise<void> {
  await ensureDocumentsLoaded(["custom_fabrics"]);
}

export function peekNextCustomFabricNumber(
  fabrics: Array<{ fabric_number: string }> = readCustomFabrics().fabrics,
  now: Date = new Date()
): string {
  return generateCustomFabricNumber(fabrics, now);
}

export function customFabricToSupplierFabric(fabric: CustomFabric): SupplierFabric {
  const displaySupplierName = fabric.supplier_name?.trim() || CUSTOM_SUPPLIER_NAME;
  return {
    id: fabric.id,
    // Still lives in the Custom bucket / storage; supplier_name is display-only.
    supplier_id: CUSTOM_SUPPLIER_ID,
    fabric_number: fabric.fabric_number,
    name: fabric.description,
    composition: fabric.composition,
    weight_gsm: fabric.weight_gsm,
    width_cm: fabric.width_cm,
    width_inches: null,
    color: fabric.color,
    finish: null,
    description: fabric.description,
    weave_type: fabric.source_note,
    gn_code: null,
    unit: "meters",
    unit_price: fabric.unit_price,
    min_order_qty: null,
    lead_time_days: 0,
    is_active: fabric.is_active,
    stock_status: "in_stock",
    mill_line: null,
    one_off: true,
    kind: "custom",
    client_id: fabric.client_id,
    client_name: fabric.client_name,
    source_note: fabric.source_note,
    supplier_name: fabric.supplier_name ?? null,
    sales_order_id: fabric.sales_order_id,
    created_at: fabric.created_at,
    created_by: fabric.created_by,
    currency: fabric.currency,
    supplier: { ...CUSTOM_SUPPLIER, name: displaySupplierName },
  };
}

export function listCustomFabricsAsSupplierFabrics(
  store: CustomFabricsFile = readCustomFabrics()
): SupplierFabric[] {
  return store.fabrics
    .filter((fabric) => fabric.is_active !== false)
    .map(customFabricToSupplierFabric)
    .sort((a, b) => a.fabric_number.localeCompare(b.fabric_number, undefined, { numeric: true }));
}

export function searchCustomFabrics(query: string, limit: number): SupplierFabric[] {
  const items = listCustomFabricsAsSupplierFabrics();
  const trimmed = query.trim();
  if (!trimmed) return items.slice(0, limit);

  const normalized = trimmed.toLowerCase();
  const matches: SupplierFabric[] = [];
  for (const item of items) {
    const haystack = [
      item.fabric_number,
      item.description,
      item.color,
      item.composition,
      item.source_note,
      item.supplier_name,
      item.client_name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (
      item.fabric_number.toLowerCase() === normalized ||
      item.fabric_number.toLowerCase().startsWith(normalized) ||
      haystack.includes(normalized)
    ) {
      matches.push(item);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}

/** Create and persist a custom fabric. Caller must have loaded custom_fabrics. */
export async function createCustomFabric(
  input: CreateCustomFabricInput
): Promise<{ fabric: CustomFabric; supplierFabric: SupplierFabric }> {
  const validated = validateCreateCustomFabricInput(input);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  const store = await readCustomFabricsFresh();
  const fabric_number = generateCustomFabricNumber(store.fabrics);
  if (store.fabrics.some((row) => row.fabric_number === fabric_number)) {
    throw new Error(`Fabric number already exists: ${fabric_number}`);
  }

  const fabric: CustomFabric = {
    id: generateCustomFabricId(fabric_number),
    fabric_number,
    description: validated.data.description,
    color: validated.data.color ?? null,
    composition: validated.data.composition ?? null,
    weight_gsm: validated.data.weight_gsm ?? null,
    width_cm: validated.data.width_cm ?? null,
    unit_price: validated.data.unit_price ?? null,
    currency: validated.data.currency ?? null,
    source_note: validated.data.source_note ?? null,
    supplier_name: validated.data.supplier_name ?? null,
    client_id: validated.data.client_id ?? null,
    client_name: validated.data.client_name ?? null,
    sales_order_id: validated.data.sales_order_id ?? null,
    one_off: true,
    kind: "custom",
    created_at: new Date().toISOString(),
    created_by: validated.data.created_by ?? null,
    is_active: true,
  };

  store.fabrics.push(fabric);
  await writeCustomFabrics(store);

  return { fabric, supplierFabric: customFabricToSupplierFabric(fabric) };
}
