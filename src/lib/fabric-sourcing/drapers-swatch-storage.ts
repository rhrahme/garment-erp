import { isSupabaseDocumentsStorage } from "@/lib/data/document-persistence";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const DRAPERS_SWATCH_BUCKET = "erp-fabric-swatch";

const STORAGE_PREFIX = "drapers";

export function isSupabaseDrapersSwatchStorage(): boolean {
  return isSupabaseDocumentsStorage();
}

export function drapersSwatchStorageObjectPath(filename: string): string {
  return `${STORAGE_PREFIX}/${filename}`;
}

export async function readDrapersSwatchFromStorage(filename: string): Promise<Buffer | null> {
  if (!isSupabaseDrapersSwatchStorage()) return null;

  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const objectPath = drapersSwatchStorageObjectPath(filename);
  const { data, error } = await admin.storage.from(DRAPERS_SWATCH_BUCKET).download(objectPath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}
