import type { FabricPrepStep, FabricPrepType } from "@/lib/types/production";

export type FabricReceiptStatus = "received" | "fabric_prep" | "handed_off";

export interface FabricReceipt {
  id: string;
  sales_order_id: string;
  so_number: string;
  sales_order_line_id: string;
  client_id: string;
  client_code: string;
  client_name: string;
  garment_type: string;
  fabric_number: string;
  supplier_id: string;
  supplier_name: string;
  fabric_meters: number;
  composition: string | null;
  weight_gsm: number | null;
  status: FabricReceiptStatus;
  fabric_prep_type: FabricPrepType | null;
  fabric_prep_step: FabricPrepStep | null;
  received_at: string;
  updated_at: string;
  handed_off_at: string | null;
}

export interface FabricReceiptsFile {
  updated_at: string | null;
  receipts: FabricReceipt[];
}

export type PendingFabricLine = {
  sales_order_line_id: string;
  sales_order_id: string;
  so_number: string;
  client_name: string;
  garment_type: string;
  piece_count: number;
  piece_names: string[];
  supplier_name: string;
  fabric_number: string;
  fabric_meters: number;
  composition: string | null;
  weight_gsm: number | null;
  label: string;
};
