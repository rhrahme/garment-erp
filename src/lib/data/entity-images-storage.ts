import fs from "fs";
import os from "os";
import path from "path";
import { isSupabaseDocumentsStorage } from "@/lib/data/document-persistence";
import { CLIENT_PHOTOS_BUCKET } from "@/lib/data/client-photo-storage";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { uploadStorageObjectWithRetry } from "@/lib/supabase/storage-upload";

/** User-uploaded fabric / garment photos share the client photos bucket. */
export const ENTITY_IMAGES_SUBDIR = "entity-images";

function localDirectory(): string {
  return path.join(
    process.env.VERCEL === "1" ? os.tmpdir() : process.cwd(),
    ENTITY_IMAGES_SUBDIR
  );
}

function objectPath(filename: string): string {
  return `${ENTITY_IMAGES_SUBDIR}/${filename}`;
}

export async function writeEntityImage(
  filename: string,
  content: Buffer,
  contentType: string
): Promise<void> {
  if (isSupabaseDocumentsStorage()) {
    const admin = getSupabaseAdmin();
    if (!admin) throw new Error("Supabase admin is not configured.");
    await uploadStorageObjectWithRetry(
      admin,
      CLIENT_PHOTOS_BUCKET,
      objectPath(filename),
      content,
      { contentType, upsert: false }
    );
    return;
  }
  fs.mkdirSync(localDirectory(), { recursive: true });
  fs.writeFileSync(path.join(localDirectory(), filename), content);
}

export async function readEntityImageFile(filename: string): Promise<Buffer | null> {
  if (isSupabaseDocumentsStorage()) {
    const admin = getSupabaseAdmin();
    if (!admin) return null;
    const { data, error } = await admin.storage
      .from(CLIENT_PHOTOS_BUCKET)
      .download(objectPath(filename));
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }
  const file = path.join(localDirectory(), filename);
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

export async function deleteEntityImageFile(filename: string): Promise<void> {
  if (isSupabaseDocumentsStorage()) {
    const admin = getSupabaseAdmin();
    if (!admin) return;
    await admin.storage.from(CLIENT_PHOTOS_BUCKET).remove([objectPath(filename)]);
    return;
  }
  const file = path.join(localDirectory(), filename);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
