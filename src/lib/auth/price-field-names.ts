/**
 * Canonical keys stripped from authenticated non-admin API payloads.
 * When Drapers/LP sync adds a new price column, register it here and extend
 * `fabric-price-access.test.ts` — do not rely on UI hiding alone.
 */
export const RESTRICTED_PRICE_FIELD_NAMES = [
  // Supplier catalog / fabric search (LP, Drapers, custom)
  "unit_price",
  "list_price",
  "actual_price",
  "account_price",
  "price",
  "cost",
  "eur",
  "purchase_price",
  "currency",
  // Sales order fabric lines & POs
  "total_amount",
  "fabric_cost",
  "fabric_cost_summary",
  "cost_hint_sar",
  "fabric_cost_hint_sar",
  "total_cost_sar",
  "landed_cost",
  "landed_cost_sar",
  // Invoice / costing internals (also handled by invoice-cost-access)
  "supplier_invoice",
  "supplier_invoice_total",
  "manufacturing_cost",
  "margin",
  "margin_pct",
  "subtotal",
] as const;

export type RestrictedPriceFieldName = (typeof RESTRICTED_PRICE_FIELD_NAMES)[number];

export const RESTRICTED_PRICE_FIELD_NAME_SET = new Set<string>(RESTRICTED_PRICE_FIELD_NAMES);
