/** Instruction / how-to notices. Open ones show on every Pattern page; all stay on /pattern/how-to. */
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
  /** Pattern operator actor -> first time they loaded the banner. */
  seen_by?: Record<string, string>;
}

export interface PatternOperatorNoticesFile {
  updated_at: string | null;
  notices: PatternOperatorNotice[];
}
