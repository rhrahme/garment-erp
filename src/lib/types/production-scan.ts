import type { StageScanNotice } from "@/lib/production/stage-scan";
import type { ScanStation } from "@/lib/production/stage-scan";

export type ProductionScanContext = "fabric-receiving" | "production" | "pattern";

export type ProductionScanEvent = {
  id: string;
  scanned_at: string;
  employee_id: string;
  employee_name: string;
  employee_id_number: string;
  station: ScanStation;
  context: ProductionScanContext;
  sticker_code: string;
  fabric_cut_code: string;
  so_number: string;
  work_order_id: string | null;
  previous_status: string | null;
  new_status: string | null;
  /** Fabric prep step after the scan (wash/soak/drying/iron) — null off the receiving floor. */
  fabric_prep_step?: string | null;
  /** Assigned or floater-overridden workstation — optional 3rd machine scan can update later. */
  workstation_id: string | null;
  notice?: StageScanNotice;
  /** Piece name from the sticker (Jacket / Trouser / Vest). */
  piece_name?: string | null;
  /** Piece abbrev (JKT / TR / VST). */
  piece_abbrev?: string | null;
  /** 1-based piece index within the garment set. */
  piece_index?: number | null;
  /** Total pieces in the set (2 for Suit, 3 for Suit+Vest). */
  piece_total?: number | null;
  /** Display mark — e.g. JKT-1/2 — for history "who worked jacket vs trouser". */
  piece_mark?: string | null;
};

export type ProductionScanEventsFile = {
  updated_at: string | null;
  events: ProductionScanEvent[];
};

export type ScanEmployeeContext = {
  employee_id: string;
  employee_name: string;
  employee_id_number: string;
  workstation_id: string | null;
};
