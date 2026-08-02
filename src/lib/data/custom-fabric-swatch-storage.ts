import fs from "fs";
import os from "os";
import path from "path";
import { isSupabaseDocumentsStorage } from "@/lib/data/document-persistence";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { uploadStorageObjectWithRetry } from "@/lib/supabase/storage-upload";

/** Reuse the fabric-swatch bucket; objects live under custom/. */
export const CUSTOM_FABRIC_SWATCH_BUCKET = "erp-fabric-swatch";
const SUBDIR = "custom";

function localDirectory(): string {
  return path.join(process.env.VERCEL === "1" ? os.tmpdir() : process.cwd(), "custom-fabric-swatches");
}

function objectPath(filename: string): string {
  return `${SUBDIR}/${filename}`;
}

export async function writeCustomFabricSwatch(
  filename: string,
  content: Buffer,
  contentType: string
): Promise<void> {
  if (isSupabaseDocumentsStorage()) {
    const admin = getSupabaseAdmin();
    if (!admin) throw new Error("Supabase admin is not configured.");
    await uploadStorageObjectWithRetry(
      admin,
      CUSTOM_FABRIC_SWATCH_BUCKET,
      objectPath(filename),
      content,
      { contentType, upsert: false }
    );
    return;
  }
  fs.mkdirSync(localDirectory(), { recursive: true });
  fs.writeFileSync(path.join(localDirectory(), filename), content);
}

export async function readCustomFabricSwatch(filename: string): Promise<Buffer | null> {
  if (isSupabaseDocumentsStorage()) {
    const admin = getSupabaseAdmin();
    if (!admin) return null;
    const { data, error } = await admin.storage
      .from(CUSTOM_FABRIC_SWATCH_BUCKET)
      .download(objectPath(filename));
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }
  const file = path.join(localDirectory(), filename);
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

export async function deleteCustomFabricSwatch(filename: string): Promise<void> {
  if (isSupabaseDocumentsStorage()) {
    const admin = getSupabaseAdmin();
    if (!admin) return;
    await admin.storage.from(CUSTOM_FABRIC_SWATCH_BUCKET).remove([objectPath(filename)]);
    return;
  }
  const file = path.join(localDirectory(), filename);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
