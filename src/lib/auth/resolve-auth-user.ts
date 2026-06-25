import type { SupabaseClient, User } from "@supabase/supabase-js";
import { withSupabaseTimeout } from "@/lib/auth/supabase-timeout";

/**
 * Resolve the signed-in user. Prefer server-validated getUser(); when GoTrue is
 * degraded (522/timeout), fall back to the JWT in cookies so a successful login
 * is not immediately lost on the next navigation.
 */
export async function resolveAuthUser(supabase: SupabaseClient): Promise<User | null> {
  const {
    data: { user },
  } = await withSupabaseTimeout(
    supabase.auth.getUser(),
    "resolveAuthUser getUser",
    { data: { user: null } }
  );

  if (user) return user;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.user ?? null;
}
