/** Audit record when an operator changes a fabric line garment / stitch type. */
export interface GarmentTypeChange {
  id: string;
  changed_at: string;
  changed_by: string;
  sales_order_id: string;
  so_number: string;
  sales_order_line_id: string;
  client_id: string;
  client_name: string;
  client_code: string;
  fabric_number: string;
  article_number: number;
  from_garment_type: string;
  to_garment_type: string;
  note: string | null;
  /** Pattern job id when one exists for the line. */
  pattern_job_id: string | null;
  admin_notified_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

export interface GarmentTypeChangesFile {
  updated_at: string | null;
  changes: GarmentTypeChange[];
}
