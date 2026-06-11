import fs from "fs";
import os from "os";
import path from "path";
import { isSupabaseDocumentsStorage } from "@/lib/data/document-persistence";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const INVOICE_FILES_BUCKET = "erp-invoice-files";

export type InvoiceFileCategory = "supplier" | "transporter";

const CATEGORY_SUBDIRS: Record<InvoiceFileCategory, string> = {
  supplier: "supplier-invoices/files",
  transporter: "supplier-invoices/transporter-files",
};

export function isSupabaseInvoiceFileStorage(): boolean {
  return isSupabaseDocumentsStorage();
}

function writableDataRoot(): string {
  if (process.env.VERCEL === "1") {
    return path.join(os.tmpdir(), "garment-erp");
  }
  return process.cwd();
}

export function getLocalInvoiceFilesDir(category: InvoiceFileCategory): string {
  return path.join(writableDataRoot(), CATEGORY_SUBDIRS[category]);
}

function storageObjectPath(category: InvoiceFileCategory, storedFilename: string): string {
  return `${CATEGORY_SUBDIRS[category]}/${storedFilename}`;
}

function ensureLocalInvoiceFilesDir(category: InvoiceFileCategory): void {
  fs.mkdirSync(getLocalInvoiceFilesDir(category), { recursive: true });
}

export async function writeInvoiceFile(
  category: InvoiceFileCategory,
  storedFilename: string,
  content: Buffer
): Promise<void> {
  if (isSupabaseInvoiceFileStorage()) {
    const admin = getSupabaseAdmin();
    if (!admin) {
      throw new Error("Supabase admin is not configured for invoice file storage.");
    }
    const objectPath = storageObjectPath(category, storedFilename);
    const { error } = await admin.storage
      .from(INVOICE_FILES_BUCKET)
      .upload(objectPath, content, { contentType: "application/pdf", upsert: true });
    if (error) {
      throw new Error(`Failed to upload invoice file to Supabase: ${error.message}`);
    }
    return;
  }

  ensureLocalInvoiceFilesDir(category);
  fs.writeFileSync(path.join(getLocalInvoiceFilesDir(category), storedFilename), content);
}

export async function readInvoiceFile(
  category: InvoiceFileCategory,
  storedFilename: string
): Promise<Buffer | null> {
  if (isSupabaseInvoiceFileStorage()) {
    const admin = getSupabaseAdmin();
    if (!admin) return null;
    const objectPath = storageObjectPath(category, storedFilename);
    const { data, error } = await admin.storage.from(INVOICE_FILES_BUCKET).download(objectPath);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }

  const filePath = path.join(getLocalInvoiceFilesDir(category), storedFilename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
}

export async function invoiceFileExists(
  category: InvoiceFileCategory,
  storedFilename: string
): Promise<boolean> {
  const content = await readInvoiceFile(category, storedFilename);
  return content !== null;
}

export function invoiceFileExistsSync(
  category: InvoiceFileCategory,
  storedFilename: string
): boolean {
  if (isSupabaseInvoiceFileStorage()) return false;
  const filePath = path.join(getLocalInvoiceFilesDir(category), storedFilename);
  return fs.existsSync(filePath);
}

export function localInvoiceFilesDirStats(category: InvoiceFileCategory): {
  fileCount: number;
  totalBytes: number;
} {
  const dir = getLocalInvoiceFilesDir(category);
  if (!fs.existsSync(dir)) {
    return { fileCount: 0, totalBytes: 0 };
  }

  let fileCount = 0;
  let totalBytes = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const stat = fs.statSync(path.join(dir, entry.name));
    fileCount += 1;
    totalBytes += stat.size;
  }
  return { fileCount, totalBytes };
}
