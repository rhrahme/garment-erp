import type { ScanHighlightStage } from "@/lib/production/scan-stage-highlight";
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

export type FabricLineReceiveStatus = "pending" | "received" | "fabric_prep" | "handed_off";

export type FabricReceivingStickerRow = {
  sticker_code: string;
  piece_name: string;
  production_code: string;
  scan_stage: ScanHighlightStage;
};

export type FabricReceivingLineRow = {
  sales_order_line_id: string;
  receipt_id: string | null;
  article_number: number;
  garment_type: string;
  fabric_number: string;
  supplier_id: string;
  supplier_name: string;
  fabric_meters: number;
  composition: string | null;
  weight_gsm: number | null;
  width_cm: number | null;
  width_inches: number | null;
  status: FabricLineReceiveStatus;
  /** Line-level code — scan at Receive (one cut per line). */
  fabric_cut_code: string;
  qr_payload: string;
  stickers: FabricReceivingStickerRow[];
  received_at: string | null;
  updated_at: string | null;
  fabric_prep_type: FabricPrepType | null;
  fabric_prep_step: FabricPrepStep | null;
  scan_stage: ScanHighlightStage;
  scan_stage_label: string;
};

export type FabricReceivingOrderRow = {
  sales_order_id: string;
  so_number: string;
  client_name: string;
  client_code: string;
  order_status: string;
  lines: FabricReceivingLineRow[];
  pending_line_count: number;
  active_line_count: number;
};

export type FabricReceivingRecentScan = {
  receipt_id: string | null;
  sales_order_line_id: string;
  so_number: string;
  client_name: string;
  article_number: number;
  fabric_cut_code: string;
  garment_type: string;
  fabric_number: string;
  status: FabricLineReceiveStatus;
  updated_at: string | null;
};

export type FabricReceivingOverview = {
  orders: FabricReceivingOrderRow[];
  recent_scans: FabricReceivingRecentScan[];
  summary: {
    open_orders: number;
    pending_lines: number;
    active_queue_lines: number;
    total_lines_shown: number;
  };
};

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
