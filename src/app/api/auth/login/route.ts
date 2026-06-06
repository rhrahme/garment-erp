import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { DEV_IMPERSONATION_COOKIE } from "@/lib/auth/dev-impersonation";
import { defaultPathForSession, isClientManagerEmail } from "@/lib/auth/permissions";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    });

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (!authError) {
      return NextResponse.json({
        ok: true,
        redirect: defaultPathForSession(isClientManagerEmail(email)),
      });
    }

    // Supabase returns "Email not confirmed" only when the password is correct.
    if (
      process.env.NODE_ENV === "development" &&
      /email not confirmed/i.test(authError.message) &&
      isClientManagerEmail(email)
    ) {
      const response = NextResponse.json({ ok: true, redirect: "/clients" });
      response.cookies.set(DEV_IMPERSONATION_COOKIE, email, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 8,
      });
      return response;
    }

    return NextResponse.json({ error: authError.message }, { status: 401 });
  } catch (error) {
    console.error("Login failed:", error);
    return NextResponse.json({ error: "Sign in failed." }, { status: 500 });
  }
}
