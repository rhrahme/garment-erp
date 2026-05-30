export type FabricSearchItem = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  fabric_number: string;
  composition: string | null;
  color: string | null;
  weight_gsm: number | null;
  width_cm: number | null;
  width_inches: number | null;
  unit_price: number | null;
  unit: string;
  stock_status?: "in_stock" | "temp_unavailable" | "permanently_unavailable" | null;
  restock_date?: string | null;
  manual?: boolean;
};
