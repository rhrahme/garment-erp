export type SalesFittingStatus = "scheduled" | "done" | "no_show" | "cancelled";

export type SalesMilestone =
  | "fabric_requested"
  | "fabric_ordered"
  | "fabric_received"
  | "in_production"
  | "finishing"
  | "ironing"
  | "ready_for_fitting"
  | "ready_for_delivery"
  | "delivered";

export interface ClientPhoto {
  id: string;
  filename: string;
  stored_filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  uploaded_by: string | null;
}

export interface ClientFabricSelection {
  id: string;
  sales_order_id: string | null;
  supplier_id: string;
  supplier_name: string;
  fabric_number: string;
  color: string | null;
  composition: string | null;
  meters: number | null;
  selected_at: string;
}

export interface SalesClientDetails {
  client_id: string;
  measurements: Record<string, string>;
  photos: ClientPhoto[];
  fabric_selections: ClientFabricSelection[];
  updated_at: string;
  updated_by: string | null;
}

export interface SalesFitting {
  id: string;
  sales_order_id: string;
  client_id: string;
  sequence_number: number;
  scheduled_at: string;
  notes: string | null;
  status: SalesFittingStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface SalesMilestoneOverride {
  sales_order_id: string;
  milestone: SalesMilestone;
  updated_at: string;
  updated_by: string | null;
  alert_acknowledged_at: string | null;
  alert_acknowledged_milestone?: SalesMilestone | null;
}

export interface SalesWorkspaceFile {
  updated_at: string | null;
  client_details: SalesClientDetails[];
  fittings: SalesFitting[];
  milestone_overrides: SalesMilestoneOverride[];
}
