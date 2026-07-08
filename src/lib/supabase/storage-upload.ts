import type { SupabaseClient } from "@supabase/supabase-js";

const STORAGE_UPLOAD_MAX_ATTEMPTS = 3;
const STORAGE_UPLOAD_RETRY_BASE_MS = 1_000;
/** Per-attempt cap — avoids hanging forever on a dead storage edge. */
const STORAGE_UPLOAD_TIMEOUT_MS = 120_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableStorageError(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("gateway timeout") ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("econnreset") ||
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("502") ||
    lower.includes("503") ||
    lower.includes("504") ||
    lower.includes("520") ||
    lower.includes("522")
  );
}

export async function uploadStorageObjectWithRetry(
  admin: SupabaseClient,
  bucket: string,
  objectPath: string,
  content: Buffer,
  options: { contentType: string; upsert?: boolean }
): Promise<void> {
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= STORAGE_UPLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      const uploadPromise = admin.storage.from(bucket).upload(objectPath, content, {
        contentType: options.contentType,
        upsert: options.upsert ?? true,
      });

      const result = await Promise.race([
        uploadPromise,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Upload timed out")), STORAGE_UPLOAD_TIMEOUT_MS);
        }),
      ]);

      if (!result.error) return;

      lastError = result.error.message;
      if (!isRetryableStorageError(lastError) || attempt === STORAGE_UPLOAD_MAX_ATTEMPTS) {
        throw new Error(lastError);
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (!isRetryableStorageError(lastError) || attempt === STORAGE_UPLOAD_MAX_ATTEMPTS) {
        throw error instanceof Error ? error : new Error(lastError);
      }
    }

    await sleep(STORAGE_UPLOAD_RETRY_BASE_MS * attempt);
  }

  throw new Error(lastError ?? "Upload failed");
}
