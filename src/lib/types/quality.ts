export const QUALITY_INSPECTION_RESULTS = ["pass", "rework", "fail"] as const;

export type QualityInspectionResult = (typeof QUALITY_INSPECTION_RESULTS)[number];

/** One QC inspection logged from the Quality Control page (or Zapier API). */
export interface QualityInspectionRecord {
  id: string;
  inspection_date: string;
  sample_size: number;
  result: QualityInspectionResult;
  notes: string | null;
  work_order_id: string | null;
  /** Human label (sticker code / WO number) captured at creation time. */
  work_order_label: string | null;
  created_at: string;
  created_by: string;
}

export interface QualityInspectionsFile {
  updated_at: string | null;
  inspections: QualityInspectionRecord[];
}
