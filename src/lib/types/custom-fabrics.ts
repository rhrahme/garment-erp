import type { PriceCurrency } from "@/lib/currency/config";

export const CUSTOM_SUPPLIER_ID = "custom";
export const CUSTOM_SUPPLIER_NAME = "Custom / One-off";

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
  client_id: string | null;
  client_name: string | null;
  sales_order_id: string | null;
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
  client_id?: string | null;
  client_name?: string | null;
  sales_order_id?: string | null;
  created_by?: string | null;
}
