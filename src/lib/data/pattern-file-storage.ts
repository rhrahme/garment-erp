import fs from "fs";
import os from "os";
import path from "path";
import { isSupabaseDocumentsStorage } from "@/lib/data/document-persistence";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { PatternFileKind } from "@/lib/types/pattern";

export const PATTERN_FILES_BUCKET = "erp-pattern-files";

const SUBDIR = "pattern-files";

const MIME_BY_KIND: Record<PatternFileKind, string> = {
  pdf: "application/pdf",
  dxf: "application/dxf",
};

export function isSupabasePatternFileStorage(): boolean {
  return isSupabaseDocumentsStorage();
}

function writableDataRoot(): string {
  if (process.env.VERCEL === "1") {
    return path.join(os.tmpdir(), "garment-erp");
  }
  return process.cwd();
}

export function getLocalPatternFilesDir(): string {
  return path.join(writableDataRoot(), SUBDIR);
}

function storageObjectPath(storedFilename: string): string {
  return `${SUBDIR}/${storedFilename}`;
}

function ensureLocalPatternFilesDir(): void {
  fs.mkdirSync(getLocalPatternFilesDir(), { recursive: true });
}

export async function writePatternFile(
  storedFilename: string,
  content: Buffer,
  kind: PatternFileKind
): Promise<void> {
  if (isSupabasePatternFileStorage()) {
    const admin = getSupabaseAdmin();
    if (!admin) {
      throw new Error("Supabase admin is not configured for pattern file storage.");
    }
    const objectPath = storageObjectPath(storedFilename);
    const { error } = await admin.storage
      .from(PATTERN_FILES_BUCKET)
      .upload(objectPath, content, { contentType: MIME_BY_KIND[kind], upsert: true });
    if (error) {
      throw new Error(`Failed to upload pattern file to Supabase: ${error.message}`);
    }
    return;
  }

  ensureLocalPatternFilesDir();
  fs.writeFileSync(path.join(getLocalPatternFilesDir(), storedFilename), content);
}

export async function readPatternFile(storedFilename: string): Promise<Buffer | null> {
  if (isSupabasePatternFileStorage()) {
    const admin = getSupabaseAdmin();
    if (!admin) return null;
    const objectPath = storageObjectPath(storedFilename);
    const { data, error } = await admin.storage.from(PATTERN_FILES_BUCKET).download(objectPath);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }

  const filePath = path.join(getLocalPatternFilesDir(), storedFilename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
}
