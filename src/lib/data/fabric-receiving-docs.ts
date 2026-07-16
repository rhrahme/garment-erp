import type { ErpDocumentKey } from "@/lib/data/document-keys";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";

export const FABRIC_RECEIVING_DOCUMENT_KEYS = [
  "sales_orders",
  "fabric_receipts",
  "fabric_receipts_archive",
  "production_work_orders",
] as const satisfies readonly ErpDocumentKey[];

export function ensureFabricReceivingDocumentsLoaded(): Promise<void> {
  return ensureDocumentsLoaded(FABRIC_RECEIVING_DOCUMENT_KEYS);
}
