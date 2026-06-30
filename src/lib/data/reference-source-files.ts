import fs from "fs";
import path from "path";

interface ReferenceSourceManifestEntry {
  id: string;
  filename: string;
  relative_path: string;
}

interface ReferenceSourceManifest {
  files?: ReferenceSourceManifestEntry[];
}

/** Reference files generated on demand — always available in production without a disk copy. */
export const RIYADH_BANK_DETAILS_DOCUMENT_ID = "riyadh-bank-details";
export const RIYADH_BANK_DETAILS_PDF_HREF = `/api/reference-documents/${RIYADH_BANK_DETAILS_DOCUMENT_ID}`;

const DYNAMIC_REFERENCE_FILE_IDS = new Set([RIYADH_BANK_DETAILS_DOCUMENT_ID]);

function loadManifest(): ReferenceSourceManifest {
  const manifestPath = path.join(process.cwd(), "src/data/reference-source-files.json");
  if (!fs.existsSync(manifestPath)) return { files: [] };
  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ReferenceSourceManifest;
}

export function isDynamicallyGeneratedReferenceFile(id: string): boolean {
  return DYNAMIC_REFERENCE_FILE_IDS.has(id);
}

/** Company wire-instruction PDFs — any logged-in ERP user may download. */
export function isAuthenticatedCompanyDocument(id: string): boolean {
  return isDynamicallyGeneratedReferenceFile(id);
}

export function isReferenceSourceFileAvailable(id: string): boolean {
  if (isDynamicallyGeneratedReferenceFile(id)) return true;
  return getReferenceSourceFileById(id) !== null;
}

export function getReferenceSourceFileById(id: string): {
  filename: string;
  absolutePath: string;
} | null {
  const entry = loadManifest().files?.find((file) => file.id === id);
  if (!entry) return null;
  const absolutePath = path.join(process.cwd(), entry.relative_path);
  if (!fs.existsSync(absolutePath)) return null;
  return { filename: entry.filename, absolutePath };
}

export function getReferenceSourceManifestEntry(id: string): ReferenceSourceManifestEntry | null {
  return loadManifest().files?.find((file) => file.id === id) ?? null;
}

export function contentTypeForReferenceFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  return "application/octet-stream";
}
