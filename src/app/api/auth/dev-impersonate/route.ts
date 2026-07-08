import { NextResponse } from "next/server";
import {
  DEV_IMPERSONATION_COOKIE,
  isDevImpersonationEnabled,
  resolveDevImpersonationEmail,
} from "@/lib/auth/dev-impersonation";
import {
  defaultPathForSession,
  isClientManagerEmail,
  isTaskOperatorEmail,
} from "@/lib/auth/permissions";

function startImpersonation(email: string) {
  const response = NextResponse.json({ ok: true, email });
  response.cookies.set(DEV_IMPERSONATION_COOKIE, email, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
}

function isDevImpersonationEmail(email: string): boolean {
  return isClientManagerEmail(email) || isTaskOperatorEmail(email);
}

/** Dev only — open in browser to sign in as QC / task operator without a password. */
export async function GET(request: Request) {
  if (!isDevImpersonationEnabled()) {
    return NextResponse.json({ error: "Dev impersonation is disabled." }, { status: 403 });
  }

  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase() ?? "";
  if (!email || !isDevImpersonationEmail(email) || !resolveDevImpersonationEmail(email)) {
    return NextResponse.json({ error: "Email not allowed." }, { status: 400 });
  }

  const redirect = NextResponse.redirect(
    new URL(
      defaultPathForSession({
        isClientManager: isClientManagerEmail(email),
        isTaskOperator: isTaskOperatorEmail(email),
      }),
      request.url
    )
  );
  redirect.cookies.set(DEV_IMPERSONATION_COOKIE, email, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return redirect;
}

export async function POST(request: Request) {
  if (!isDevImpersonationEnabled()) {
    return NextResponse.json({ error: "Dev impersonation is disabled." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim().toLowerCase() ?? "";
    if (!email || !isDevImpersonationEmail(email)) {
      return NextResponse.json(
        { error: "Only restricted production emails can be impersonated in dev." },
        { status: 400 }
      );
    }

    if (!resolveDevImpersonationEmail(email)) {
      return NextResponse.json({ error: "Email not allowed." }, { status: 400 });
    }

    return startImpersonation(email);
  } catch (error) {
    console.error("Dev impersonation failed:", error);
    return NextResponse.json({ error: "Failed to start dev impersonation." }, { status: 500 });
  }
}
