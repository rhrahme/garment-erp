/** Pattern chart update owed after a tailor started an alteration session. */
export type PatternAlterationPendingStatus =
  | "pending"
  | "acknowledged"
  | "chart_updated";

export type PatternAlterationRelatedArticle = {
  sales_order_line_id: string | null;
  article_number: number | null;
  garment_type: string | null;
  fabric_number: string | null;
  /** First production sticker code when available. */
  production_code: string | null;
};

export type PatternAlterationPendingItem = {
  id: string;
  created_at: string;
  status: PatternAlterationPendingStatus;
  session_id: string;
  employee_id: string;
  employee_name: string;
  employee_id_number: string;
  production_code: string;
  scan_code: string;
  so_number: string | null;
  sales_order_id: string | null;
  client_id: string | null;
  client_name: string | null;
  client_code: string | null;
  fabric_number: string | null;
  garment_type: string | null;
  piece_mark: string | null;
  fabric_cut_code: string | null;
  /** Same SO + same fabric_number (consolidated fabric siblings). */
  related_articles: PatternAlterationRelatedArticle[];
  /**
   * Pattern comments for the tailor - synced onto the Production / stitcher
   * sheet (special_instructions) when a linked client pattern exists.
   */
  stitcher_comments: string | null;
  stitcher_comments_at: string | null;
  stitcher_comments_by: string | null;
  /** Linked client pattern for deep-link / sheet sync when resolved. */
  client_pattern_id: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  chart_updated_at: string | null;
  chart_updated_by: string | null;
};

export type PatternAlterationPendingFile = {
  updated_at: string | null;
  items: PatternAlterationPendingItem[];
};
