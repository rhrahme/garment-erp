import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  badgeLoginEmail,
  badgeSupabasePassword,
  checkBadgePassword,
  createBadgeCredential,
  lookupBadgeForLogin,
  provisionBadgeSupabaseUser,
} from "@/lib/auth/badge-login";
import {
  AUTH_SERVICE_UNAVAILABLE_MESSAGE,
  isAuthServiceUnavailable,
  signInWithPasswordWithRetry,
} from "@/lib/auth/format-auth-error";
import { sendEmail } from "@/lib/email/smtp";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";

const PATTERN_LANDING = "/pattern";

type BadgeLoginBody = {
  action?: "lookup" | "set_password" | "login";
  badge?: string;
  password?: string;
  confirm_password?: string;
};

async function signInBadgeUser(employee: PayrollEmployee) {
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

  const email = badgeLoginEmail(employee.id);
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

async function notifyAdminOfActivation(employee: PayrollEmployee): Promise<void> {
  const admin = process.env.ADMIN_ALERT_EMAIL || process.env.SMTP_USER;
  if (!admin) return;
  try {
    await sendEmail({
      to: [admin],
      subject: `Badge login activated: ${employee.full_name}`,
      text: [
        `${employee.full_name} (badge ${employee.employee_id_number}) set their badge`,
        `login password and can now sign in to the pattern workspace with`,
        `badge number + password.`,
        "",
        `If this was not expected, remove the credential (badge_login_credentials)`,
        `or deactivate the employee in payroll.`,
      ].join("\n"),
    });
  } catch (error) {
    console.warn(
      "[badge-login] activation email failed:",
      error instanceof Error ? error.message : error
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BadgeLoginBody;
    const action = body.action ?? "login";
    const badge = body.badge?.trim() ?? "";
    if (!badge) {
      return NextResponse.json({ error: "Scan or type your badge number." }, { status: 400 });
    }

    const lookup = await lookupBadgeForLogin(badge);
    if (!lookup.ok) {
      return NextResponse.json({ error: lookup.error }, { status: lookup.status });
    }
    const { employee, credential } = lookup;

    if (action === "lookup") {
      return NextResponse.json({
        ok: true,
        employee_name: employee.short_name || employee.full_name,
        has_password: Boolean(credential),
      });
    }

    if (action === "set_password") {
      const password = body.password ?? "";
      if (password !== (body.confirm_password ?? "")) {
        return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
      }
      const created = await createBadgeCredential(employee, password);
      if (!created.ok) {
        return NextResponse.json({ error: created.error }, { status: created.status });
      }
      await provisionBadgeSupabaseUser(employee);
      const signedIn = await signInBadgeUser(employee);
      if (!signedIn.ok) {
        return NextResponse.json({ error: signedIn.error }, { status: signedIn.status });
      }
      void notifyAdminOfActivation(employee);
      return NextResponse.json({ ok: true, redirect: PATTERN_LANDING });
    }

    // action === "login"
    const checked = await checkBadgePassword(employee.id, body.password ?? "");
    if (!checked.ok) {
      return NextResponse.json({ error: checked.error }, { status: checked.status });
    }
    const signedIn = await signInBadgeUser(employee);
    if (!signedIn.ok) {
      return NextResponse.json({ error: signedIn.error }, { status: signedIn.status });
    }
    return NextResponse.json({ ok: true, redirect: PATTERN_LANDING });
  } catch (error) {
    console.error("Badge login failed:", error);
    return NextResponse.json({ error: "Badge login failed." }, { status: 500 });
  }
}
