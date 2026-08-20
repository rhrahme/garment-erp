import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  badgeLandingPath,
  badgeLoginEmail,
  badgeLoginKindForEmployee,
  badgeSupabasePassword,
  provisionBadgeSupabaseUser,
} from "@/lib/auth/badge-login";
import {
  AUTH_SERVICE_UNAVAILABLE_MESSAGE,
  isAuthServiceUnavailable,
  signInWithPasswordWithRetry,
} from "@/lib/auth/format-auth-error";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";

export const PATTERN_LANDING = "/pattern";
export const INVENTORY_LANDING = "/inventory";

export function landingForBadgeEmployee(employee: PayrollEmployee): string {
  return badgeLandingPath(badgeLoginKindForEmployee(employee) ?? "pattern");
}

export async function signInBadgeUser(employee: PayrollEmployee) {
  const cookieStore = await cookies();
  const supabase = createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });

  const kind = badgeLoginKindForEmployee(employee) ?? "pattern";
  const email = badgeLoginEmail(employee.id, kind);
  const password = badgeSupabasePassword(employee.id);

  let { error, timedOut } = await signInWithPasswordWithRetry(() =>
    supabase.auth.signInWithPassword({ email, password })
  );

  // First login or rotated service key: provision/heal the synthetic user, retry once.
  if (error && !timedOut && !isAuthServiceUnavailable(error)) {
    await provisionBadgeSupabaseUser(employee);
    ({ error, timedOut } = await signInWithPasswordWithRetry(() =>
      supabase.auth.signInWithPassword({ email, password })
    ));
  }

  if (timedOut || isAuthServiceUnavailable(error)) {
    return { ok: false as const, status: 503, error: AUTH_SERVICE_UNAVAILABLE_MESSAGE };
  }
  if (error) {
    console.error("[badge-login] session sign-in failed:", error.message);
    return { ok: false as const, status: 500, error: "Sign in failed. Try again." };
  }
  return { ok: true as const };
}
