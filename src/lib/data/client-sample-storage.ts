import fs from "fs";
import os from "os";
import path from "path";
import { isSupabaseDocumentsStorage } from "@/lib/data/document-persistence";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { uploadStorageObjectWithRetry } from "@/lib/supabase/storage-upload";
import { CLIENT_PHOTOS_BUCKET } from "@/lib/data/client-photo-storage";

/** Ready-made sample images share the client photos bucket, own subdir. */
export const CLIENT_SAMPLES_SUBDIR = "client-samples";

function localDirectory(): string {
  return path.join(
    process.env.VERCEL === "1" ? os.tmpdir() : process.cwd(),
    CLIENT_SAMPLES_SUBDIR
  );
}

function objectPath(filename: string): string {
  return `${CLIENT_SAMPLES_SUBDIR}/${filename}`;
}

export async function writeClientSampleImage(
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

export async function readClientSampleImage(filename: string): Promise<Buffer | null> {
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

export async function deleteClientSampleImage(filename: string): Promise<void> {
  if (isSupabaseDocumentsStorage()) {
    const admin = getSupabaseAdmin();
    if (!admin) return;
    await admin.storage.from(CLIENT_PHOTOS_BUCKET).remove([objectPath(filename)]);
    return;
  }
  const file = path.join(localDirectory(), filename);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
