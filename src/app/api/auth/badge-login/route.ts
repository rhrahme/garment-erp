import { NextResponse } from "next/server";
import {
  checkBadgePassword,
  createBadgeCredential,
  lookupBadgeForLogin,
  provisionBadgeSupabaseUser,
} from "@/lib/auth/badge-login";
import { landingForBadgeEmployee, signInBadgeUser } from "@/lib/auth/sign-in-badge-session";
import { recordLoginFromRequest } from "@/lib/data/login-events";
import { sendEmail } from "@/lib/email/smtp";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";

type BadgeLoginBody = {
  action?: "lookup" | "set_password" | "login";
  badge?: string;
  password?: string;
  confirm_password?: string;
};

async function notifyAdminOfActivation(employee: PayrollEmployee): Promise<void> {
  const admin = process.env.ADMIN_ALERT_EMAIL || process.env.SMTP_USER;
  if (!admin) return;
  try {
    await sendEmail({
      to: [admin],
      subject: `Badge login activated: ${employee.full_name}`,
      text: [
        `${employee.full_name} (badge ${employee.employee_id_number}) set their badge`,
        `login password and can now sign in with badge number + password.`,
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
      if (action !== "lookup") {
        recordLoginFromRequest(request, {
          outcome: "failure",
          method: "badge",
          actor: badge,
          identifier: badge,
          error: lookup.error,
        });
      }
      return NextResponse.json({ error: lookup.error }, { status: lookup.status });
    }
    const { employee, credential } = lookup;
    const actor = `${employee.short_name || employee.full_name} (${employee.employee_id_number})`;

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
        recordLoginFromRequest(request, {
          outcome: "failure",
          method: "badge",
          actor,
          identifier: badge,
          error: signedIn.error,
        });
        return NextResponse.json({ error: signedIn.error }, { status: signedIn.status });
      }
      recordLoginFromRequest(request, {
        outcome: "success",
        method: "badge",
        actor,
        identifier: badge,
      });
      void notifyAdminOfActivation(employee);
      return NextResponse.json({ ok: true, redirect: landingForBadgeEmployee(employee) });
    }

    // action === "login"
    const checked = await checkBadgePassword(employee.id, body.password ?? "");
    if (!checked.ok) {
      recordLoginFromRequest(request, {
        outcome: "failure",
        method: "badge",
        actor,
        identifier: badge,
        error: checked.error,
      });
      return NextResponse.json({ error: checked.error }, { status: checked.status });
    }
    const signedIn = await signInBadgeUser(employee);
    if (!signedIn.ok) {
      recordLoginFromRequest(request, {
        outcome: "failure",
        method: "badge",
        actor,
        identifier: badge,
        error: signedIn.error,
      });
      return NextResponse.json({ error: signedIn.error }, { status: signedIn.status });
    }
    recordLoginFromRequest(request, {
      outcome: "success",
      method: "badge",
      actor,
      identifier: badge,
    });
    return NextResponse.json({ ok: true, redirect: landingForBadgeEmployee(employee) });
  } catch (error) {
    console.error("Badge login failed:", error);
    return NextResponse.json({ error: "Badge login failed." }, { status: 500 });
  }
}
