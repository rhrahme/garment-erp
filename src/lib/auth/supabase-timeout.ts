/** Cap Supabase auth/profile lookups so SSR and middleware fail-open when degraded. */
export const SUPABASE_AUTH_TIMEOUT_MS = 4_000;

export async function withSupabaseTimeout<T>(
  promise: Promise<T>,
  label: string,
  fallback: T
): Promise<T> {
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timeout`)), SUPABASE_AUTH_TIMEOUT_MS)
      ),
    ]);
  } catch (error) {
    console.warn(`[auth] ${label} failed:`, error instanceof Error ? error.message : error);
    return fallback;
  }
}
