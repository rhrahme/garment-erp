/** Roles that must reprint A4 / stickers after a fabric change. */
export type FabricChangeAlertRole = "admin" | "qc" | "pattern" | "production" | "sales";

export const FABRIC_CHANGE_ALERT_ROLES: FabricChangeAlertRole[] = [
  "admin",
  "qc",
  "pattern",
  "production",
  "sales",
];

export type FabricChangeAlertKind =
  | "line_edited"
  | "line_added"
  | "line_removed"
  | "line_delete_approved"
  | "garment_corrected";

export type FabricChangeAcknowledgement = {
  at: string;
  by: string;
};

/**
 * Outstanding fabric-change alert: teams may have already printed stickers / A4
 * and need to reprint after article, supplier, meters, garment, or line changes.
 */
export interface FabricChangeAlert {
  id: string;
  created_at: string;
  created_by: string;
  kind: FabricChangeAlertKind;
  sales_order_id: string;
  so_number: string;
  sales_order_line_id: string | null;
  client_id: string;
  client_name: string;
  client_code: string;
  article_number: number | null;
  fabric_number: string | null;
  summary: string;
  from_fabric_number: string | null;
  to_fabric_number: string | null;
  from_supplier_name: string | null;
  to_supplier_name: string | null;
  from_meters: number | null;
  to_meters: number | null;
  from_garment_type: string | null;
  to_garment_type: string | null;
  had_a4_printed: boolean;
  had_prep_stickers: boolean;
  had_prod_stickers: boolean;
  had_pattern_work: boolean;
  had_fabric_pos: boolean;
  acknowledgements: Partial<Record<FabricChangeAlertRole, FabricChangeAcknowledgement>>;
  admin_notified_at: string | null;
}

export interface FabricChangeAlertsFile {
  updated_at: string | null;
  alerts: FabricChangeAlert[];
}
