import type { DeliveryDestination } from "@/lib/shipping/delivery-destinations";

export type SalesOrderStatus = "open" | "fabric_pos_created" | "complete";

export interface FabricLabelSticker {
  code: string;
  piece_name: string;
  sequence: number;
}

export interface SalesOrderFabricLine {
  id: string;
  garment_type: string;
  label_count: number;
  label_stickers: FabricLabelSticker[];
  supplier_id: string;
  supplier_name: string;
  fabric_number: string;
  quantity: number;
  unit: string;
  unit_price: number;
  composition: string | null;
  weight_gsm: number | null;
  width_cm: number | null;
  width_inches: number | null;
  color: string | null;
  stock_status?: "in_stock" | "temp_unavailable" | "permanently_unavailable" | null;
  restock_date?: string | null;
  needs_replacement?: boolean;
  replacement_fabric_number?: string | null;
}

export interface SalesOrder {
  id: string;
  so_number: string;
  client_id: string;
  client_code: string;
  client_name: string;
  /** Generated when fabric POs are created — sent to suppliers */
  client_reference: string | null;
  order_date: string;
  delivery_date: string | null;
  /** Where suppliers ship fabric — Riyadh or Dubai */
  delivery_destination: DeliveryDestination | null;
  status: SalesOrderStatus;
  notes: string | null;
  fabric_lines: SalesOrderFabricLine[];
  fabric_po_ids: string[];
  /** Ready-made retail brand when not a person client order */
  retail_brand?: string | null;
  /** Garment/article batch name, e.g. "Linen Short", "Regular Group Suits Set" */
  product_article?: string | null;
}

export interface SalesOrdersFile {
  updated_at: string | null;
  orders: SalesOrder[];
}
