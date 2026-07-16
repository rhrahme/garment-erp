import fs from "fs";
import os from "os";
import path from "path";
import { isSupabaseDocumentsStorage } from "@/lib/data/document-persistence";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { uploadStorageObjectWithRetry } from "@/lib/supabase/storage-upload";

export const DEFECT_PHOTOS_BUCKET = "erp-fabric-defect-photos";

const SUBDIR = "fabric-defect-photos";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function isSupabaseDefectPhotoStorage(): boolean {
  return isSupabaseDocumentsStorage();
}

export function isAllowedDefectPhotoContentType(contentType: string): boolean {
  return ALLOWED_CONTENT_TYPES.has(contentType.toLowerCase().trim());
}

function writableDataRoot(): string {
  if (process.env.VERCEL === "1") {
    return path.join(os.tmpdir(), "garment-erp");
  }
  return process.cwd();
}

export function getLocalDefectPhotosDir(): string {
  return path.join(writableDataRoot(), SUBDIR);
}

function storageObjectPath(storedFilename: string): string {
  return `${SUBDIR}/${storedFilename}`;
}

function ensureLocalDefectPhotosDir(): void {
  fs.mkdirSync(getLocalDefectPhotosDir(), { recursive: true });
}

export async function writeDefectPhoto(
  storedFilename: string,
  content: Buffer,
  contentType: string
): Promise<void> {
  if (isSupabaseDefectPhotoStorage()) {
    const admin = getSupabaseAdmin();
    if (!admin) {
      throw new Error("Supabase admin is not configured for defect photo storage.");
    }
    const objectPath = storageObjectPath(storedFilename);
    try {
      await uploadStorageObjectWithRetry(admin, DEFECT_PHOTOS_BUCKET, objectPath, content, {
        contentType,
        upsert: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      throw new Error(`Failed to upload defect photo to Supabase: ${message}`);
    }
    return;
  }

  ensureLocalDefectPhotosDir();
  fs.writeFileSync(path.join(getLocalDefectPhotosDir(), storedFilename), content);
}

export async function readDefectPhoto(storedFilename: string): Promise<Buffer | null> {
  if (isSupabaseDefectPhotoStorage()) {
    const admin = getSupabaseAdmin();
    if (!admin) return null;
    const objectPath = storageObjectPath(storedFilename);
    const { data, error } = await admin.storage.from(DEFECT_PHOTOS_BUCKET).download(objectPath);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }

  const filePath = path.join(getLocalDefectPhotosDir(), storedFilename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
}
