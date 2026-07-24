import type { FabricLineReceiveStatus } from "@/lib/types/fabric-receipts";

/** Task team match outcome for thread or buttons against a fabric article. */
export type ThreadButtonMatchStatus =
  | "pending"
  | "confirmed"
  | "missing"
  | "decision_needed";

export const THREAD_BUTTON_MATCH_STATUSES: {
  id: ThreadButtonMatchStatus;
  label: string;
  hint: string;
}[] = [
  { id: "confirmed", label: "Confirmed", hint: "Matched OK" },
  { id: "missing", label: "Missing", hint: "Not available" },
  { id: "decision_needed", label: "Decision to be taken", hint: "Needs a call / unsure" },
];

export type ThreadButtonMatchComponent = "thread" | "button";

export interface ThreadButtonMatchRecord {
  id: string;
  sales_order_id: string;
  sales_order_line_id: string;
  so_number: string;
  client_id: string;
  client_code: string;
  client_name: string;
  garment_type: string;
  fabric_number: string;
  article_number: number;
  fabric_cut_code: string | null;
  thread_status: ThreadButtonMatchStatus;
  button_status: ThreadButtonMatchStatus;
  thread_updated_at: string | null;
  thread_updated_by: string | null;
  button_updated_at: string | null;
  button_updated_by: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ThreadButtonMatchesFile {
  updated_at: string | null;
  matches: ThreadButtonMatchRecord[];
}

/** Floor line + match status for the Matching workspace. */
export type ThreadButtonMatchListItem = {
  sales_order_id: string;
  sales_order_line_id: string;
  receipt_id: string | null;
  so_number: string;
  client_name: string;
  client_code: string;
  article_number: number;
  garment_type: string;
  fabric_number: string;
  fabric_cut_code: string;
  receive_status: FabricLineReceiveStatus;
  scan_stage_label: string;
  thread_status: ThreadButtonMatchStatus;
  button_status: ThreadButtonMatchStatus;
  thread_updated_at: string | null;
  thread_updated_by: string | null;
  button_updated_at: string | null;
  button_updated_by: string | null;
  note: string | null;
  match_id: string | null;
  /** Both thread and button confirmed. */
  is_fully_matched: boolean;
  /** Either component missing or needs a decision. */
  needs_attention: boolean;
};

export type ThreadButtonMatchListFilter =
  | "needs_matching"
  | "needs_attention"
  | "missing"
  | "decision_needed"
  | "done"
  | "all";

export type ThreadButtonMatchSummary = {
  total: number;
  needs_matching: number;
  needs_attention: number;
  missing: number;
  decision_needed: number;
  done: number;
};
