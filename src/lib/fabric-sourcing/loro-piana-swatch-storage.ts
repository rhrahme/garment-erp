import { isSupabaseDocumentsStorage } from "@/lib/data/document-persistence";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const LORO_PIANA_SWATCH_BUCKET = "erp-fabric-swatch";

const STORAGE_PREFIX = "loro-piana";

export function isSupabaseLoroPianaSwatchStorage(): boolean {
  return isSupabaseDocumentsStorage();
}

export function loroPianaSwatchStorageObjectPath(filename: string): string {
  return `${STORAGE_PREFIX}/${filename}`;
}

export async function readLoroPianaSwatchFromStorage(
  filename: string
): Promise<Buffer | null> {
  if (!isSupabaseLoroPianaSwatchStorage()) return null;

  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const objectPath = loroPianaSwatchStorageObjectPath(filename);
  const { data, error } = await admin.storage
    .from(LORO_PIANA_SWATCH_BUCKET)
    .download(objectPath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}
