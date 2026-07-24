export type PatternJobStatus =
  | "pending"
  | "assigned"
  | "drafting"
  | "awaiting_fitting"
  | "revising"
  | "ready_for_cutting"
  | "completed"
  | "blocked"
  | "cancelled";

export type PatternFittingOutcome = "pass" | "adjust" | "fail" | "cancelled" | "no_show";

export type PatternFittingStatus = "scheduled" | "completed" | "cancelled";

export type PatternFileKind = "dxf" | "pdf";

export interface PatternRevisionFile {
  id: string;
  kind: PatternFileKind;
  filename: string;
  stored_filename: string;
  uploaded_at: string;
  uploaded_by: string | null;
  size_bytes: number;
}

export interface PatternFitting {
  id: string;
  fitting_number: number;
  scheduled_at: string | null;
  completed_at: string | null;
  outcome: PatternFittingOutcome | null;
  notes: string | null;
  attendees: string[];
  status: PatternFittingStatus;
  created_at: string;
  updated_at: string;
}

export interface PatternRevision {
  id: string;
  version: number;
  triggered_by_fitting_id: string | null;
  changes_summary: string | null;
  revised_at: string;
  revised_by: string | null;
  pattern_files: PatternRevisionFile[];
}

export interface PatternJob {
  id: string;
  sales_order_id: string;
  sales_order_line_id: string;
  so_number: string;
  client_id: string;
  client_name: string;
  client_code: string;
  garment_type: string;
  piece_name: string;
  article_number: number;
  fabric_number: string;
  supplier: string;
  composition: string | null;
  gsm: number | null;
  width_cm: number | null;
  width_inches: number | null;
  color: string | null;
  meters: number;
  status: PatternJobStatus;
  assigned_to: string | null;
  /** Optional link to a master client pattern in the pattern library (+ specific trial). */
  client_pattern_id?: string | null;
  client_pattern_version_id?: string | null;
  pattern_code: string | null;
  pattern_size_notes: string | null;
  trial_priority: boolean;
  blocked_reason: string | null;
  notes: string | null;
  fittings: PatternFitting[];
  revisions: PatternRevision[];
  created_at: string;
  updated_at: string;
}

export interface PatternJobsFile {
  updated_at: string | null;
  jobs: PatternJob[];
}

export type PatternWorkTab =
  | "new"
  | "drafting"
  | "in_fittings"
  | "revising"
  | "ready_for_cutting"
  | "blocked"
  | "completed";

export interface PatternJobRow {
  job: PatternJob;
  order_delivery_date: string | null;
}

export interface PatternAwaitingLinesOrder {
  sales_order_id: string;
  so_number: string;
  client_id: string;
  client_name: string;
  client_code: string;
  order_date: string;
  delivery_date: string | null;
  status: "awaiting_lines";
}

export interface PatternOverview {
  jobs: PatternJobRow[];
  awaiting_lines_orders: PatternAwaitingLinesOrder[];
  summary: {
    total_jobs: number;
    by_status: Record<PatternJobStatus, number>;
    awaiting_lines_count: number;
  };
}
