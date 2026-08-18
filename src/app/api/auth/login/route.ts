import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { DEV_IMPERSONATION_COOKIE } from "@/lib/auth/dev-impersonation";
import {
  AUTH_SERVICE_UNAVAILABLE_MESSAGE,
  formatAuthError,
  isAuthServiceUnavailable,
  signInWithPasswordWithRetry,
} from "@/lib/auth/format-auth-error";
import {
  defaultPathForEmail,
  isClientManagerEmail,
  isProductionOperatorEmail,
  isStitchOperatorEmail,
  isSalesOperatorEmail,
  isAccountingOperatorEmail,
  isTaskOperatorEmail,
} from "@/lib/auth/permissions";
import {
  checkBadgePassword,
  lookupBadgeForLogin,
  patternBadgeIdForEmail,
} from "@/lib/auth/badge-login";
import {
  EMAIL_LOGIN_DISABLED_MESSAGE,
  isEmailLoginDisabled,
} from "@/lib/auth/email-login-disabled";
import { PATTERN_LANDING, signInBadgeUser } from "@/lib/auth/sign-in-badge-session";
import { recordLoginFromRequest } from "@/lib/data/login-events";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const mappedBadgeId = patternBadgeIdForEmail(email);
    if (mappedBadgeId) {
      const lookup = await lookupBadgeForLogin(mappedBadgeId);
      if (!lookup.ok) {
        recordLoginFromRequest(request, {
          outcome: "failure",
          method: "email",
          actor: email,
          identifier: email,
          error: lookup.error,
        });
        return NextResponse.json({ error: lookup.error }, { status: lookup.status });
      }
      const actor = `${lookup.employee.short_name || lookup.employee.full_name} (${lookup.employee.employee_id_number})`;
      const checked = await checkBadgePassword(lookup.employee.id, password);
      if (!checked.ok) {
        recordLoginFromRequest(request, {
          outcome: "failure",
          method: "email",
          actor,
          identifier: email,
          error: checked.error,
        });
        return NextResponse.json({ error: checked.error }, { status: checked.status });
      }
      const signedIn = await signInBadgeUser(lookup.employee);
      if (!signedIn.ok) {
        recordLoginFromRequest(request, {
          outcome: "failure",
          method: "email",
          actor,
          identifier: email,
          error: signedIn.error,
        });
        return NextResponse.json({ error: signedIn.error }, { status: signedIn.status });
      }
      recordLoginFromRequest(request, {
        outcome: "success",
        method: "email",
        actor,
        identifier: email,
      });
      return NextResponse.json({ ok: true, redirect: PATTERN_LANDING });
    }

    if (isEmailLoginDisabled(email)) {
      return NextResponse.json({ error: EMAIL_LOGIN_DISABLED_MESSAGE }, { status: 403 });
    }

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

    const { error: authError, timedOut } = await signInWithPasswordWithRetry(() =>
      supabase.auth.signInWithPassword({ email, password })
    );

    if (timedOut || isAuthServiceUnavailable(authError)) {
      return NextResponse.json({ error: AUTH_SERVICE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }

    if (!authError) {
      recordLoginFromRequest(request, {
        outcome: "success",
        method: "email",
        actor: email,
        identifier: email,
      });
      return NextResponse.json({
        ok: true,
        redirect: defaultPathForEmail(email),
      });
    }

    // Supabase returns "Email not confirmed" only when the password is correct.
    if (
      process.env.NODE_ENV === "development" &&
      /email not confirmed/i.test(authError.message) &&
      (isClientManagerEmail(email) ||
        isTaskOperatorEmail(email) ||
        isStitchOperatorEmail(email) ||
        isProductionOperatorEmail(email) ||
        isSalesOperatorEmail(email) ||
        isAccountingOperatorEmail(email))
    ) {
      const response = NextResponse.json({
        ok: true,
        redirect: defaultPathForEmail(email),
      });
      response.cookies.set(DEV_IMPERSONATION_COOKIE, email, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 8,
      });
      return response;
    }

    const failMessage = formatAuthError(authError);
    recordLoginFromRequest(request, {
      outcome: "failure",
      method: "email",
      actor: email,
      identifier: email,
      error: failMessage,
    });
    return NextResponse.json({ error: failMessage }, { status: 401 });
  } catch (error) {
    console.error("Login failed:", error);
    return NextResponse.json({ error: "Sign in failed." }, { status: 500 });
  }
}
