export interface Supplier {
  id: string;
  code: string;
  name: string;
  contact_person: string | null;
  /** Comma-separated order emails for display / mailto. */
  email: string | null;
  /** All order email addresses — POs go to everyone on this list. */
  emails?: string[];
  country: string | null;
  is_fabric_supplier: boolean;
  lead_time_days: number | null;
}

export interface SupplierFabric {
  /** A single line on a supplier price list — fabric number, specs, list price. Not stock on hand. */
  id: string;
  supplier_id: string;
  fabric_number: string;
  name: string | null;
  composition: string | null;
  weight_gsm: number | null;
  width_cm: number | null;
  width_inches: number | null;
  color: string | null;
  finish: string | null;
  description: string | null;
  weave_type: string | null;
  gn_code: string | null;
  unit: string;
  unit_price: number | null;
  min_order_qty: number | null;
  lead_time_days: number | null;
  is_active: boolean;
  /** Warehouse availability from supplier stock updates (e.g. Drapers PDF). */
  stock_status?: "in_stock" | "temp_unavailable" | "permanently_unavailable" | null;
  restock_date?: string | null;
  stock_updated_at?: string | null;
  /** Loro Piana price list only — Solbiati (S-prefix linen) vs Loro Piana wool/cashmere. */
  mill_line?: "loro_piana" | "solbiati" | null;
  supplier?: Supplier;
}

export interface SupplierPriceList {
  id: string;
  supplier_id: string;
  name: string;
  effective_date: string;
  currency: string;
  uploaded_at: string;
  fabric_count?: number;
  source_file?: string;
  supplier?: Supplier;
}

export interface PurchaseOrderLine {
  id: string;
  fabric_number: string | null;
  quantity_ordered: number;
  unit_price: number;
  label_count?: number | null;
  label_stickers?: Array<{ code: string; piece_name: string; sequence: number }> | null;
  garment_type?: string | null;
  client_reference: string | null;
  /** Supplier reply availability — out of stock, restock date, substitute. */
  stock_status?: "in_stock" | "temp_unavailable" | "permanently_unavailable" | null;
  restock_date?: string | null;
  availability_note?: string | null;
  substitute_fabric_number?: string | null;
  supplier_fabric?: SupplierFabric;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string;
  status: string;
  order_date: string;
  expected_date: string | null;
  total_amount: number;
  client_reference: string | null;
  emailed_at: string | null;
  email_to: string | null;
  expected_carrier: string | null;
  sales_order_id?: string | null;
  supplier?: Supplier;
  lines?: PurchaseOrderLine[];
}

export interface FabricOrderEmail {
  from?: string;
  to: string;
  cc?: string;
  subject: string;
  body: string;
}
