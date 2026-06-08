/** Canonical supplier id for HAGAN warehouse linen (formerly gliani-stock / gliani-warehouse). */
export const CANCLINI_SUPPLIER_ID = "canclini";
export const WOOL_STOCK_SUPPLIER_ID = "wool-stock";

const WAREHOUSE_LINEN_ALIASES = new Set(["gliani-stock", "gliani-warehouse"]);
const WAREHOUSE_STOCK_IDS = new Set([CANCLINI_SUPPLIER_ID, WOOL_STOCK_SUPPLIER_ID]);

/** Legacy order/archive ids → current catalog supplier id. */
export function resolveFabricSupplierId(supplierId: string): string {
  const normalized = supplierId.trim().toLowerCase();
  if (WAREHOUSE_LINEN_ALIASES.has(normalized)) return CANCLINI_SUPPLIER_ID;
  return supplierId;
}

export function isWarehouseLinenSupplier(supplierId: string): boolean {
  return resolveFabricSupplierId(supplierId).toLowerCase() === CANCLINI_SUPPLIER_ID;
}

export function isWarehouseStockSupplier(supplierId: string): boolean {
  return WAREHOUSE_STOCK_IDS.has(resolveFabricSupplierId(supplierId).toLowerCase());
}

/** UI label — legacy "Gliani Stock" rows show as Canclini. */
export function resolveFabricSupplierDisplayName(
  supplierId: string,
  supplierName: string
): string {
  if (isWarehouseLinenSupplier(supplierId)) return "Canclini";
  return supplierName;
}
