export type FabricTransferLineRef = {
  sales_order_id: string;
  so_number: string;
  client_id: string;
  client_code: string;
  client_name: string;
  line_id: string;
  fabric_number: string;
  garment_type: string;
  supplier_id: string;
  supplier_name: string;
  sticker_codes: string[];
};

/** Snapshot of source receiving / production stage at transfer time. */
export type FabricTransferSourceStage = {
  stage_label: string;
  client_name: string;
  receipt_status: "received" | "fabric_prep" | "handed_off" | null;
  fabric_prep_step: "wash" | "soak" | "drying" | "iron" | null;
  active_work_order_count: number;
};

/** Permanent audit record for moving received (or on-order) fabric between clients/SOs. */
export interface FabricTransfer {
  id: string;
  transferred_at: string;
  transferred_by: string;
  reason: string;
  meters: number;
  unit: string;
  is_partial: boolean;
  source: FabricTransferLineRef;
  /** Source line quantity after transfer (0 when fully moved). */
  source_remaining_meters: number;
  destination: FabricTransferLineRef;
  /** Replacement reorder line appended on the source SO. */
  replacement: FabricTransferLineRef;
  replacement_fabric_po_ids: string[];
  /** Receipt re-keyed or split onto the destination line, if any. */
  destination_receipt_id: string | null;
  /** Receiving / production stage on the source line when transferred. */
  source_stage?: FabricTransferSourceStage | null;
  /** Operator confirmed mid receiving-pipeline warning. */
  acknowledged_receiving_stage?: boolean;
  /** Admin cancelled cutting WOs / handed-off gate to allow transfer. */
  admin_override?: boolean;
  /** Cutting (or pre-cutting) work orders removed as part of Admin override. */
  cancelled_production_work_order_ids?: string[];
}

export interface FabricTransfersFile {
  updated_at: string | null;
  transfers: FabricTransfer[];
}
