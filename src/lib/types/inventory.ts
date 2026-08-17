/**
 * Factory inventory: trims/accessories (buttons, zippers, thread, lining,
 * canvas, ...) plus any material the team wants to track. Each garment type
 * has a consumption recipe; stock is deducted automatically when an article
 * is packed (stage scan finishing -> packed), once per fabric line.
 */

export type InventoryItem = {
  id: string;
  name: string;
  /** Free text grouping, e.g. "Buttons", "Zippers", "Thread", "Lining". */
  category: string | null;
  /** Garment brand the trim carries: "Fouad Rhame", "Gliani", "White label".
   *  Null = brandless consumable (e.g. laundry hanger). Optional because
   *  items created before Aug 17 2026 predate the field. */
  brand?: string | null;
  /** Display unit, e.g. "pcs", "m", "cone", "roll". */
  unit: string;
  quantity_on_hand: number;
  /** Warn when on-hand falls at/below this. Null = no alert. */
  low_stock_threshold: number | null;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type GarmentRecipeLine = {
  item_id: string;
  quantity_per_garment: number;
};

/** What one garment of this type consumes when it is cut. */
export type GarmentRecipe = {
  /** Matches SalesOrderFabricLine.garment_type (case-insensitive). */
  garment_type: string;
  lines: GarmentRecipeLine[];
  updated_at: string;
  updated_by: string | null;
};

export type InventoryLedgerReason =
  | "garment_packed"
  | "manual_adjust"
  | "received"
  | "correction";

export type InventoryLedgerEntry = {
  id: string;
  item_id: string;
  /** Negative = consumed, positive = received/corrected. */
  delta: number;
  balance_after: number;
  reason: InventoryLedgerReason;
  garment_type: string | null;
  so_number: string | null;
  production_code: string | null;
  /** Dedupe key for automatic deductions - one per sales order fabric line. */
  sales_order_line_id: string | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
};

export type InventoryStoreFile = {
  updated_at: string | null;
  items: InventoryItem[];
  recipes: GarmentRecipe[];
  ledger: InventoryLedgerEntry[];
};

export const EMPTY_INVENTORY_STORE: InventoryStoreFile = {
  updated_at: null,
  items: [],
  recipes: [],
  ledger: [],
};

export function normalizeGarmentTypeKey(garmentType: string | null | undefined): string {
  return (garmentType ?? "").trim().toLowerCase();
}

export function inventoryItemIsLow(item: InventoryItem): boolean {
  return item.low_stock_threshold != null && item.quantity_on_hand <= item.low_stock_threshold;
}
