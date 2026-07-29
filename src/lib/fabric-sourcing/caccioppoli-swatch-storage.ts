import { isSupabaseDocumentsStorage } from "@/lib/data/document-persistence";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const CACCIOPPOLI_SWATCH_BUCKET = "erp-fabric-swatch";

const STORAGE_PREFIX = "caccioppoli";

export function isSupabaseCaccioppoliSwatchStorage(): boolean {
  return isSupabaseDocumentsStorage();
}

export function caccioppoliSwatchStorageObjectPath(filename: string): string {
  return `${STORAGE_PREFIX}/${filename}`;
}

export async function readCaccioppoliSwatchFromStorage(
  filename: string
): Promise<Buffer | null> {
  if (!isSupabaseCaccioppoliSwatchStorage()) return null;

  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const objectPath = caccioppoliSwatchStorageObjectPath(filename);
  const { data, error } = await admin.storage
    .from(CACCIOPPOLI_SWATCH_BUCKET)
    .download(objectPath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}
