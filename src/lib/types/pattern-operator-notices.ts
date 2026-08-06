/** Instruction / how-to notices shown to Pattern on /pattern until acknowledged. */
export type PatternOperatorNoticeStatus = "open" | "acknowledged";

export interface PatternOperatorNotice {
  id: string;
  created_at: string;
  created_by: string;
  title: string;
  /** Plain text steps (newlines kept). */
  body: string;
  href: string | null;
  href_label: string | null;
  status: PatternOperatorNoticeStatus;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  emailed_at: string | null;
}

export interface PatternOperatorNoticesFile {
  updated_at: string | null;
  notices: PatternOperatorNotice[];
}
