import type { SupabaseClient, User } from "@supabase/supabase-js";
import { SUPABASE_AUTH_TIMEOUT_MS } from "@/lib/auth/supabase-timeout";

export type ResolvedAuthUser = {
  user: User | null;
  /**
   * True when GoTrue could not give a definitive answer (timeout, network
   * error, 5xx). A signed-in user must NOT be treated as logged-out in this
   * state - callers should hold and retry instead of bouncing to /login.
   */
  degraded: boolean;
};

type AuthCallResult<T> =
  | { outcome: "ok"; value: T }
  | { outcome: "degraded" };

async function callWithTimeout<T>(
  promise: Promise<T>,
  label: string
): Promise<AuthCallResult<T>> {
  try {
    const value = await Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timeout`)), SUPABASE_AUTH_TIMEOUT_MS)
      ),
    ]);
    return { outcome: "ok", value };
  } catch (error) {
    console.warn(`[auth] ${label} failed:`, error instanceof Error ? error.message : error);
    return { outcome: "degraded" };
  }
}

/** GoTrue reachable but transiently failing (network status 0, 5xx, 429). */
function isRetryableAuthError(error: { status?: number } | null | undefined): boolean {
  if (!error) return false;
  const status = error.status ?? 0;
  return status === 0 || status === 429 || status >= 500;
}

/**
 * Resolve the signed-in user. Prefer server-validated getUser(); when GoTrue is
 * degraded (522/timeout), fall back to the JWT in cookies so a successful login
 * is not immediately lost on the next navigation. Reports `degraded: true` when
 * neither call got a definitive answer, so middleware can hold-and-retry
 * instead of failing closed to /login.
 */
export async function resolveAuthUserDetailed(
  supabase: SupabaseClient
): Promise<ResolvedAuthUser> {
  let degraded = false;

  const userResult = await callWithTimeout(supabase.auth.getUser(), "resolveAuthUser getUser");
  if (userResult.outcome === "ok") {
    const { data, error } = userResult.value;
    if (data.user) return { user: data.user, degraded: false };
    if (isRetryableAuthError(error)) degraded = true;
  } else {
    degraded = true;
  }

  // getSession may still hit GoTrue for refresh when auth is 522/degraded - cap it too.
  const sessionResult = await callWithTimeout(
    supabase.auth.getSession(),
    "resolveAuthUser getSession"
  );
  if (sessionResult.outcome === "ok") {
    const { data, error } = sessionResult.value;
    if (data.session?.user) return { user: data.session.user, degraded: false };
    if (isRetryableAuthError(error)) degraded = true;
  } else {
    degraded = true;
  }

  return { user: null, degraded };
}

export async function resolveAuthUser(supabase: SupabaseClient): Promise<User | null> {
  const { user } = await resolveAuthUserDetailed(supabase);
  return user;
}
