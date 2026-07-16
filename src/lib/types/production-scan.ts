import type { StageScanNotice } from "@/lib/production/stage-scan";
import type { ScanStation } from "@/lib/production/stage-scan";

export type ProductionScanContext = "fabric-receiving" | "production";

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
