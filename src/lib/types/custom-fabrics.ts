import type { PriceCurrency } from "@/lib/currency/config";

export const CUSTOM_SUPPLIER_ID = "custom";
export const CUSTOM_SUPPLIER_NAME = "Custom / One-off";

/** Uploaded swatch/photo for a custom / one-off fabric. */
export interface CustomFabricImage {
  id: string;
  filename: string;
  stored_filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  uploaded_by: string | null;
}

/** Persisted one-off / custom fabric (not a mill price-list row). */
export interface CustomFabric {
  id: string;
  fabric_number: string;
  description: string;
  color: string | null;
  composition: string | null;
  weight_gsm: number | null;
  width_cm: number | null;
  unit_price: number | null;
  currency: PriceCurrency | null;
  source_note: string | null;
  /** Free-text name of a one-off / new supplier (mill/shop) not in the catalog. */
  supplier_name: string | null;
  client_id: string | null;
  client_name: string | null;
  sales_order_id: string | null;
  /** Optional swatch/photo uploaded with the fabric. */
  image?: CustomFabricImage | null;
  one_off: true;
  kind: "custom";
  created_at: string;
  created_by: string | null;
  is_active: boolean;
}

export interface CustomFabricsFile {
  updated_at: string | null;
  fabrics: CustomFabric[];
}

export interface CreateCustomFabricInput {
  description: string;
  color?: string | null;
  composition?: string | null;
  weight_gsm?: number | null;
  width_cm?: number | null;
  unit_price?: number | null;
  currency?: PriceCurrency | null;
  source_note?: string | null;
  supplier_name?: string | null;
  client_id?: string | null;
  client_name?: string | null;
  sales_order_id?: string | null;
  created_by?: string | null;
  image?: CustomFabricImage | null;
}
