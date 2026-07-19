import fs from "fs";
import os from "os";
import path from "path";
import { isSupabaseDocumentsStorage } from "@/lib/data/document-persistence";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { uploadStorageObjectWithRetry } from "@/lib/supabase/storage-upload";

export const CLIENT_PHOTOS_BUCKET = "erp-client-photos";
const SUBDIR = "client-photos";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export function isAllowedClientPhotoType(contentType: string): boolean {
  return ALLOWED_TYPES.has(contentType.toLowerCase().trim());
}

function localDirectory(): string {
  return path.join(process.env.VERCEL === "1" ? os.tmpdir() : process.cwd(), SUBDIR);
}

function objectPath(filename: string): string {
  return `${SUBDIR}/${filename}`;
}

export async function writeClientPhoto(
  filename: string,
  content: Buffer,
  contentType: string
): Promise<void> {
  if (isSupabaseDocumentsStorage()) {
    const admin = getSupabaseAdmin();
    if (!admin) throw new Error("Supabase admin is not configured.");
    await uploadStorageObjectWithRetry(admin, CLIENT_PHOTOS_BUCKET, objectPath(filename), content, {
      contentType,
      upsert: false,
    });
    return;
  }
  fs.mkdirSync(localDirectory(), { recursive: true });
  fs.writeFileSync(path.join(localDirectory(), filename), content);
}

export async function readClientPhoto(filename: string): Promise<Buffer | null> {
  if (isSupabaseDocumentsStorage()) {
    const admin = getSupabaseAdmin();
    if (!admin) return null;
    const { data, error } = await admin.storage.from(CLIENT_PHOTOS_BUCKET).download(objectPath(filename));
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }
  const file = path.join(localDirectory(), filename);
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}
