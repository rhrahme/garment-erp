import type { ScanHighlightStage } from "@/lib/production/scan-stage-highlight";
import type { FabricPrepStep, FabricPrepType } from "@/lib/types/production";

export type FabricReceiptStatus = "received" | "fabric_prep" | "handed_off";

export type FabricDefectFoundAt = "receiving" | "cutting";
export type FabricDefectStatus = "open" | "acknowledged" | "resolved";
export type FabricDefectType =
  | "shade"
  | "hole"
  | "stain"
  | "crease"
  | "wrong_fabric"
  | "other";

export const FABRIC_DEFECT_TYPES: { id: FabricDefectType; label: string }[] = [
  { id: "shade", label: "Shade" },
  { id: "hole", label: "Hole" },
  { id: "stain", label: "Stain" },
  { id: "crease", label: "Crease" },
  { id: "wrong_fabric", label: "Wrong fabric" },
  { id: "other", label: "Other" },
];

export interface FabricDefectPhoto {
  id: string;
  filename: string;
  stored_filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
}

export interface FabricDefectReport {
  id: string;
  reported_at: string;
  reported_by: string;
  note: string;
  defect_type?: FabricDefectType | string;
  found_at: FabricDefectFoundAt;
  /** True when found_at === "cutting" (receiving missed it). */
  task_team_miss: boolean;
  photos: FabricDefectPhoto[];
  status: FabricDefectStatus;
  acknowledged_at?: string;
  acknowledged_by?: string;
  resolved_at?: string;
  resolved_by?: string;
}

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
  /**
   * Scan timestamps for the wash/soak → dry → iron lifecycle. Optional so existing
   * receipts stay valid; used only to DISPLAY elapsed durations (never blocking, no timers).
   */
  /** Scan 1 — wash or soak started (fabric in machine / soak bowl). */
  wash_started_at?: string | null;
  /** Scan 2 — removed from wash/soak and hung to dry. */
  dry_started_at?: string | null;
  /** Scan 3 — dry done, ironing started. */
  iron_started_at?: string | null;
  /** Scan 4 — ironing finished / ready for cutting. */
  iron_done_at?: string | null;
  /** Floor / QC defect reports — optional so existing receipts stay valid. */
  defect_reports?: FabricDefectReport[];
}

export type FabricDefectListItem = {
  receipt_id: string;
  sales_order_id: string;
  sales_order_line_id: string;
  so_number: string;
  client_name: string;
  client_code: string;
  fabric_number: string;
  garment_type: string;
  receipt_status: FabricReceiptStatus;
  defect: FabricDefectReport;
  thumbnail_photo_id: string | null;
};

export type FabricDefectSummary = {
  open: number;
  acknowledged: number;
  resolved: number;
  found_at_receiving: number;
  found_at_cutting: number;
  task_team_misses: number;
};

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
  /** Lifecycle scan timestamps — optional, drive elapsed-duration display only. */
  wash_started_at?: string | null;
  dry_started_at?: string | null;
  iron_started_at?: string | null;
  iron_done_at?: string | null;
  scan_stage: ScanHighlightStage;
  scan_stage_label: string;
  /** Any defect report on this receipt (open or closed). */
  has_defect_report: boolean;
  open_defect_count: number;
};

export type FabricReceivingOrderRow = {
  sales_order_id: string;
  so_number: string;
  client_name: string;
  client_code: string;
  order_date: string;
  is_archived: boolean;
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
