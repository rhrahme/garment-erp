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
}

export interface FabricTransfersFile {
  updated_at: string | null;
  transfers: FabricTransfer[];
}
