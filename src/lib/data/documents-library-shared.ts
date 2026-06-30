import type { DocumentCategoryId, ErpDocumentDefinition } from "@/lib/data/erp-document-catalog";

/** Client-safe types and helpers — no Node fs imports. */

export interface ErpDocumentRow extends ErpDocumentDefinition {
  recordSummary: string;
  updatedAt: string | null;
  supabaseUpdatedAt: string | null;
  approximateBytes: number;
}

export interface PriceCatalogRow {
  id: string;
  supplierName: string;
  priceListName: string;
  sourceFile: string | null;
  fabricCount: number;
  importedAt: string | null;
  filePath: string;
  appHref: string;
}

export interface ScannedFileGroup {
  id: string;
  label: string;
  description: string;
  fileCount: number;
  totalBytes: number;
  appHref: string;
  folderPath: string;
}

export interface ReferenceSourceFileRow {
  id: string;
  supplier: string;
  filename: string;
  relativePath: string;
  type: string;
  catalogId: string | null;
  importStatus: "imported" | "archived" | string;
  notes: string | null;
  fileBytes: number;
  existsOnDisk: boolean;
  /** True when the file exists on disk or can be generated/served by the API. */
  isAvailable: boolean;
  downloadHref: string;
}

export interface DocumentsLibrarySnapshot {
  storageMode: "supabase" | "local";
  erpDocumentCount: number;
  totalErpBytes: number;
  categories: Array<{
    id: DocumentCategoryId;
    label: string;
    description: string;
    documents: ErpDocumentRow[];
  }>;
  priceCatalogs: PriceCatalogRow[];
  scannedFiles: ScannedFileGroup[];
  referenceSourceFiles: ReferenceSourceFileRow[];
  referenceSourceUpdatedAt: string | null;
}

export function formatDataSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
