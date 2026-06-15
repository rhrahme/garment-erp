import caccioppoliJackets from "@/data/suppliers/caccioppoli-jackets-ss26.json";
import caccioppoliShirting from "@/data/suppliers/caccioppoli-shirting-ss26.json";
import zegnaCatalog from "@/data/suppliers/zegna-ss26.json";
import drapersCatalog from "@/data/suppliers/drapers-hs-ss26.json";
import stylbiellaAw25Catalog from "@/data/suppliers/stylbiella-aw25.json";
import stylbiellaSs25Catalog from "@/data/suppliers/stylbiella-ss25.json";
import stylbiellaSs26Catalog from "@/data/suppliers/stylbiella-ss26.json";
import loroPianaCatalog from "@/data/suppliers/loro-piana-ss26.json";
import cancliniLinenStock from "@/data/suppliers/canclini-linen-stock.json";
import woolStock from "@/data/suppliers/wool-stock.json";
import gazabaCutlength from "@/data/suppliers/gazaba-cutlength-price-list.json";
import {
  expandLoroPianaStyleQuery,
  getLoroPianaMillLine,
  isLoroPianaStyleSupplier,
  normalizeLoroPianaFabricNumber,
  resolveLoroPianaFabricInput,
} from "@/lib/fabric-sourcing/loro-piana-styles";
import { resolveFabricSupplierId } from "@/lib/fabric-sourcing/supplier-aliases";
import {
  getAllSuppliersFromContacts,
  getSupplierByIdFromContacts,
  readSupplierContacts,
} from "@/lib/data/supplier-contacts";
import type { SupplierContactRow } from "@/lib/types/supplier-contacts";
import type { Supplier, SupplierFabric, SupplierPriceList } from "@/lib/types/fabric-sourcing";

/** Price list line items — reference prices from supplier PDFs, NOT warehouse stock. */

interface RawFabric {
  fabric_number: string;
  composition?: string | null;
  color?: string | null;
  description?: string | null;
  weight_gsm?: number | null;
  weight_linear?: string | null;
  width_cm?: number | null;
  gn_code?: string | null;
  mill_code?: string | null;
  mill_name?: string | null;
  collection?: string | null;
  unit_price?: number | null;
  unit?: string;
  currency?: string;
  is_active?: boolean;
  category?: string;
  stock_status?: "in_stock" | "temp_unavailable" | "permanently_unavailable" | null;
  restock_date?: string | null;
  stock_updated_at?: string | null;
}

interface RawCatalog {
  document_type: string;
  supplier: {
    code: string;
    name: string;
    country: string;
    is_fabric_supplier: boolean;
    lead_time_days: number;
    currency: string;
  };
  price_list_name: string;
  imported_at: string;
  source_file?: string;
  source_files?: string[];
  fabric_count: number;
  fabrics: RawFabric[];
}

const CACCIOPPOLI_ID = "caccioppoli";
const ZEGNA_ID = "zegna";
const DRAPERS_ID = "drapers";
const STYLBIELLA_ID = "stylbiella";
const LORO_PIANA_ID = "loro-piana";
const SOLBIATI_ID = "solbiati";
const CANCLINI_ID = "canclini";
const WOOL_STOCK_ID = "wool-stock";
const GAZABA_ID = "gazaba";

function stubSupplierForCatalog(supplierId: string): Supplier {
  return {
    id: supplierId,
    code: supplierId.toUpperCase(),
    name: supplierId,
    contact_person: null,
    email: null,
    country: null,
    is_fabric_supplier: true,
    lead_time_days: 14,
  };
}

function supplierForCatalog(supplierId: string): Supplier {
  return stubSupplierForCatalog(supplierId);
}

export async function getFactoryOrdersEmail(): Promise<string | null> {
  const contacts = await readSupplierContacts();
  return contacts.factory_orders_email;
}

export async function getInboxScanEmailFromContacts(): Promise<string | null> {
  const contacts = await readSupplierContacts();
  return contacts.inbox_scan_email;
}

/** Known default carriers per supplier — overrides text-based detection when scanning replies. */
const SUPPLIER_DEFAULT_CARRIER: Record<string, string> = {
  drapers: "DHL",
  "loro-piana": "DHL",
};

export function getSupplierDefaultCarrier(supplierId: string | null | undefined): string | null {
  if (!supplierId) return null;
  return SUPPLIER_DEFAULT_CARRIER[supplierId] ?? null;
}

function toFabrics(catalog: RawCatalog, supplierId: string, supplier: Supplier, prefix: string): SupplierFabric[] {
  return catalog.fabrics.map((f) => ({
    id: `${prefix}-${f.fabric_number}`,
    supplier_id: supplierId,
    fabric_number: f.fabric_number,
    name: [f.collection ?? f.description, f.mill_code].filter(Boolean).join(" — ") || f.fabric_number,
    composition: f.composition ?? null,
    weight_gsm: f.weight_gsm ?? null,
    width_cm: f.width_cm ?? null,
    width_inches: null,
    color: f.color ?? null,
    finish: f.category ?? null,
    description: f.description ?? null,
    weave_type: f.mill_name ?? null,
    gn_code: f.gn_code ?? null,
    unit: f.unit ?? "meters",
    unit_price: f.unit_price ?? null,
    min_order_qty: null,
    lead_time_days: 14,
    is_active: f.is_active ?? f.unit_price != null,
    stock_status: f.stock_status ?? null,
    restock_date: f.restock_date ?? null,
    stock_updated_at: f.stock_updated_at ?? null,
    mill_line:
      supplierId === LORO_PIANA_ID || supplierId === SOLBIATI_ID
        ? getLoroPianaMillLine(f.fabric_number)
        : null,
    supplier,
  }));
}

function mergeCatalogFabrics(
  catalogs: RawCatalog[],
  supplierId: string,
  supplier: Supplier,
  idPrefix: string
): SupplierFabric[] {
  const byNumber = new Map<string, SupplierFabric>();
  for (const catalog of catalogs) {
    for (const fabric of toFabrics(catalog, supplierId, supplier, idPrefix)) {
      byNumber.set(fabric.fabric_number.toLowerCase(), fabric);
    }
  }
  return [...byNumber.values()];
}

function catalogSourceFile(catalog: RawCatalog): string {
  return catalog.source_file ?? catalog.source_files?.[0] ?? "catalog";
}

function toPriceList(catalog: RawCatalog, supplierId: string, supplier: Supplier): SupplierPriceList {
  const sourceFile = catalogSourceFile(catalog);
  return {
    id: `pl-${prefixSlug(sourceFile)}`,
    supplier_id: supplierId,
    name: catalog.price_list_name,
    effective_date: "2026-01-01",
    currency: catalog.supplier.currency,
    uploaded_at: catalog.imported_at,
    fabric_count: catalog.fabric_count,
    source_file: sourceFile,
    supplier,
  };
}

function prefixSlug(filename: string) {
  return filename.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40);
}

export const caccioppoliSupplier: Supplier = supplierForCatalog(CACCIOPPOLI_ID);
export const zegnaSupplier: Supplier = supplierForCatalog(ZEGNA_ID);
export const drapersSupplier: Supplier = supplierForCatalog(DRAPERS_ID);
export const stylbiellaSupplier: Supplier = supplierForCatalog(STYLBIELLA_ID);
export const loroPianaSupplier: Supplier = supplierForCatalog(LORO_PIANA_ID);
export const solbiatiSupplier: Supplier = supplierForCatalog(SOLBIATI_ID);
export const cancliniSupplier: Supplier = supplierForCatalog(CANCLINI_ID);
export const woolStockSupplier: Supplier = supplierForCatalog(WOOL_STOCK_ID);
export const gazabaSupplier: Supplier = supplierForCatalog(GAZABA_ID);

const jackets = caccioppoliJackets as RawCatalog;
const shirting = caccioppoliShirting as RawCatalog;
const zegna = zegnaCatalog as RawCatalog;
const drapers = drapersCatalog as RawCatalog;
const stylbiellaAw25 = stylbiellaAw25Catalog as RawCatalog;
const stylbiellaSs25 = stylbiellaSs25Catalog as RawCatalog;
const stylbiellaSs26 = stylbiellaSs26Catalog as RawCatalog;
const stylbiellaCatalogs = [stylbiellaAw25, stylbiellaSs25, stylbiellaSs26];
const loroPiana = loroPianaCatalog as RawCatalog;
const cancliniStock = cancliniLinenStock as RawCatalog;
const woolStockCatalog = woolStock as RawCatalog;
const gazabaCatalog = gazabaCutlength as RawCatalog;

export const caccioppoliFabrics: SupplierFabric[] = [
  ...toFabrics(jackets, CACCIOPPOLI_ID, caccioppoliSupplier, "cac-j"),
  ...toFabrics(shirting, CACCIOPPOLI_ID, caccioppoliSupplier, "cac-s"),
];

export const zegnaFabrics: SupplierFabric[] = toFabrics(zegna, ZEGNA_ID, zegnaSupplier, "zeg");
export const drapersFabrics: SupplierFabric[] = toFabrics(drapers, DRAPERS_ID, drapersSupplier, "drp");
export const stylbiellaFabrics: SupplierFabric[] = mergeCatalogFabrics(
  stylbiellaCatalogs,
  STYLBIELLA_ID,
  stylbiellaSupplier,
  "sty"
);
const loroPianaCatalogFabrics: SupplierFabric[] = toFabrics(
  loroPiana,
  LORO_PIANA_ID,
  loroPianaSupplier,
  "lp"
);

export const solbiatiFabrics: SupplierFabric[] = loroPianaCatalogFabrics
  .filter((fabric) => getLoroPianaMillLine(fabric.fabric_number) === "solbiati")
  .map((fabric) => ({
    ...fabric,
    id: `sol-${fabric.fabric_number}`,
    supplier_id: SOLBIATI_ID,
    supplier: solbiatiSupplier,
    mill_line: "solbiati" as const,
  }));

export const loroPianaFabrics: SupplierFabric[] = loroPianaCatalogFabrics
  .filter((fabric) => getLoroPianaMillLine(fabric.fabric_number) !== "solbiati")
  .map((fabric) => ({
    ...fabric,
    mill_line: "loro_piana" as const,
  }));
export const cancliniFabrics: SupplierFabric[] = toFabrics(
  cancliniStock,
  CANCLINI_ID,
  cancliniSupplier,
  "can"
);
export const woolStockFabrics: SupplierFabric[] = toFabrics(
  woolStockCatalog,
  WOOL_STOCK_ID,
  woolStockSupplier,
  "wool"
);
export const gazabaFabrics: SupplierFabric[] = toFabrics(
  gazabaCatalog,
  GAZABA_ID,
  gazabaSupplier,
  "gzb"
);

export const allPriceListItems: SupplierFabric[] = [
  ...caccioppoliFabrics,
  ...zegnaFabrics,
  ...drapersFabrics,
  ...stylbiellaFabrics,
  ...loroPianaFabrics,
  ...solbiatiFabrics,
  ...cancliniFabrics,
  ...woolStockFabrics,
  ...gazabaFabrics,
];

const fabricsBySupplier = new Map<string, SupplierFabric[]>();
for (const fabric of allPriceListItems) {
  const bucket = fabricsBySupplier.get(fabric.supplier_id) ?? [];
  bucket.push(fabric);
  fabricsBySupplier.set(fabric.supplier_id, bucket);
}
for (const bucket of fabricsBySupplier.values()) {
  bucket.sort((a, b) => a.fabric_number.localeCompare(b.fabric_number, undefined, { numeric: true }));
}

export function getFabricsBySupplierId(supplierId: string): SupplierFabric[] {
  return fabricsBySupplier.get(resolveFabricSupplierId(supplierId)) ?? [];
}

export function searchSupplierFabrics(supplierId: string, query: string, limit: number): SupplierFabric[] {
  const canonicalId = resolveFabricSupplierId(supplierId);
  const items = getFabricsBySupplierId(canonicalId);
  const trimmed = query.trim();
  if (!trimmed) {
    return items.slice(0, limit);
  }

  const byNumber = new Map(items.map((item) => [item.fabric_number.toLowerCase(), item]));

  const usesLpStyleInput = isLoroPianaStyleSupplier(canonicalId);
  const fabricNumbers = usesLpStyleInput ? expandLoroPianaStyleQuery(trimmed) : [trimmed];
  const loroCandidates = usesLpStyleInput ? resolveLoroPianaFabricInput(trimmed).candidates : [trimmed];

  if (fabricNumbers.length > 1) {
    const rangeMatches: SupplierFabric[] = [];
    for (const fabricNumber of fabricNumbers) {
      const item = byNumber.get(fabricNumber.toLowerCase());
      if (item) rangeMatches.push(item);
      if (rangeMatches.length >= limit) break;
    }
    if (rangeMatches.length > 0) return rangeMatches;
  }

  for (const candidate of loroCandidates) {
    const exact = byNumber.get(candidate.toLowerCase());
    if (exact) return [exact];
  }

  const normalized = usesLpStyleInput
    ? normalizeLoroPianaFabricNumber(trimmed).toLowerCase()
    : trimmed.toLowerCase();

  const exact = byNumber.get(normalized);
  if (exact) return [exact];

  const matches: SupplierFabric[] = [];
  for (const item of items) {
    const fabricNumber = item.fabric_number.toLowerCase();
    if (fabricNumber.startsWith(normalized) || fabricNumber.includes(normalized)) {
      matches.push(item);
      if (matches.length >= limit) break;
      continue;
    }

    const haystack = [item.composition, item.color, item.description].filter(Boolean).join(" ").toLowerCase();
    if (haystack.includes(normalized)) {
      matches.push(item);
      if (matches.length >= limit) break;
    }
  }

  return matches.slice(0, limit);
}

export const allPriceLists: SupplierPriceList[] = [
  toPriceList(jackets, CACCIOPPOLI_ID, caccioppoliSupplier),
  toPriceList(shirting, CACCIOPPOLI_ID, caccioppoliSupplier),
  toPriceList(zegna, ZEGNA_ID, zegnaSupplier),
  toPriceList(drapers, DRAPERS_ID, drapersSupplier),
  toPriceList(stylbiellaAw25, STYLBIELLA_ID, stylbiellaSupplier),
  toPriceList(stylbiellaSs25, STYLBIELLA_ID, stylbiellaSupplier),
  toPriceList(stylbiellaSs26, STYLBIELLA_ID, stylbiellaSupplier),
  {
    ...toPriceList(loroPiana, LORO_PIANA_ID, loroPianaSupplier),
    fabric_count: loroPianaFabrics.length,
  },
  {
    ...toPriceList(loroPiana, SOLBIATI_ID, solbiatiSupplier),
    id: "pl-loro-piana-ss26-solbiati",
    name: "Solbiati — SS26 (Loro Piana account)",
    fabric_count: solbiatiFabrics.length,
  },
  toPriceList(cancliniStock, CANCLINI_ID, cancliniSupplier),
  toPriceList(woolStockCatalog, WOOL_STOCK_ID, woolStockSupplier),
  toPriceList(gazabaCatalog, GAZABA_ID, gazabaSupplier),
];

export async function getSupplierContacts(): Promise<SupplierContactRow[]> {
  const contacts = await readSupplierContacts();
  return contacts.suppliers;
}

export async function getSupplierById(id: string): Promise<Supplier | undefined> {
  return getSupplierByIdFromContacts(id);
}

export async function attachLiveSupplierContacts(fabrics: SupplierFabric[]): Promise<SupplierFabric[]> {
  const suppliers = new Map((await getAllSuppliersFromContacts()).map((supplier) => [supplier.id, supplier]));
  return fabrics.map((fabric) => ({
    ...fabric,
    supplier: suppliers.get(fabric.supplier_id) ?? fabric.supplier,
  }));
}

export async function getImportedSuppliers(): Promise<Supplier[]> {
  return getAllSuppliersFromContacts();
}

export function getImportedPriceLists(): SupplierPriceList[] {
  return allPriceLists;
}

export function getAllPriceListItems(): SupplierFabric[] {
  return allPriceListItems;
}
