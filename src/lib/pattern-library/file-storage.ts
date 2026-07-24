import fs from "fs";
import os from "os";
import path from "path";
import { isSupabaseDocumentsStorage } from "@/lib/data/document-persistence";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PATTERN_FILES_BUCKET } from "@/lib/data/pattern-file-storage";
import type { PatternLibraryFileKind } from "@/lib/types/pattern-library";

/** Library attachments live in the existing erp-pattern-files bucket under their own prefix. */
const SUBDIR = "pattern-library";

const KIND_BY_EXTENSION: Record<string, PatternLibraryFileKind> = {
  tud: "tud",
  xlsx: "xlsx",
  xls: "xlsx",
  dxf: "dxf",
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  heic: "image",
};

const MIME_BY_EXTENSION: Record<string, string> = {
  tud: "application/octet-stream",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  dxf: "application/dxf",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
};

export const PATTERN_LIBRARY_MAX_FILE_BYTES = 50 * 1024 * 1024;

export function classifyPatternLibraryFile(filename: string): {
  kind: PatternLibraryFileKind;
  contentType: string;
} {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return {
    kind: KIND_BY_EXTENSION[extension] ?? "other",
    contentType: MIME_BY_EXTENSION[extension] ?? "application/octet-stream",
  };
}

function writableDataRoot(): string {
  if (process.env.VERCEL === "1") {
    return path.join(os.tmpdir(), "garment-erp");
  }
  return process.cwd();
}

function localDir(): string {
  return path.join(writableDataRoot(), SUBDIR);
}

function objectPath(storedFilename: string): string {
  return `${SUBDIR}/${storedFilename}`;
}

export async function writePatternLibraryFile(
  storedFilename: string,
  content: Buffer,
  contentType: string
): Promise<void> {
  if (isSupabaseDocumentsStorage()) {
    const admin = getSupabaseAdmin();
    if (!admin) {
      throw new Error("Supabase admin is not configured for pattern library file storage.");
    }
    let { error } = await admin.storage
      .from(PATTERN_FILES_BUCKET)
      .upload(objectPath(storedFilename), content, { contentType, upsert: true });
    if (error && /mime/i.test(error.message)) {
      // Bucket MIME allowlist not yet broadened (migration 015) — octet-stream is always allowed.
      ({ error } = await admin.storage
        .from(PATTERN_FILES_BUCKET)
        .upload(objectPath(storedFilename), content, {
          contentType: "application/octet-stream",
          upsert: true,
        }));
    }
    if (error) {
      throw new Error(`Failed to upload pattern library file to Supabase: ${error.message}`);
    }
    return;
  }

  fs.mkdirSync(localDir(), { recursive: true });
  fs.writeFileSync(path.join(localDir(), storedFilename), content);
}

export async function readPatternLibraryFile(storedFilename: string): Promise<Buffer | null> {
  if (isSupabaseDocumentsStorage()) {
    const admin = getSupabaseAdmin();
    if (!admin) return null;
    const { data, error } = await admin.storage
      .from(PATTERN_FILES_BUCKET)
      .download(objectPath(storedFilename));
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }

  const filePath = path.join(localDir(), storedFilename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
}
