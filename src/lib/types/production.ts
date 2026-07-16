export const PRODUCTION_STAGES = [
  "received",
  "fabric_prep",
  "cutting",
  "sewing",
  "washing",
  "finishing",
  "packed",
  "completed",
] as const;

export type ProductionStage = (typeof PRODUCTION_STAGES)[number];

export type FabricPrepType = "wash_iron" | "soak_iron" | "iron_only";
export type FabricPrepStep = "wash" | "soak" | "drying" | "iron";

export interface ProductionWorkOrder {
  id: string;
  sticker_code: string;
  sales_order_id: string;
  so_number: string;
  sales_order_line_id: string;
  client_id: string;
  client_code: string;
  client_name: string;
  garment_type: string;
  piece_name: string;
  fabric_number: string;
  supplier_id: string;
  supplier_name: string;
  fabric_meters: number;
  status: ProductionStage;
  fabric_prep_type: FabricPrepType | null;
  fabric_prep_step: FabricPrepStep | null;
  received_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface ProductionWorkOrdersFile {
  updated_at: string | null;
  work_orders: ProductionWorkOrder[];
}
