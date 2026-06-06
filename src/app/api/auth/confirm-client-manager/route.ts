import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { confirmSupabaseUserByEmail } from "@/lib/auth/confirm-supabase-user";
import { isClientManagerEmail } from "@/lib/auth/permissions";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Only available in development." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";

    if (!email || !password) {
      return NextResponse.json({ error: "email and password are required." }, { status: 400 });
    }

    if (!isClientManagerEmail(email)) {
      return NextResponse.json({ error: "Email is not a client manager account." }, { status: 403 });
    }

    const supabase = createClient(getSupabaseUrl(), getSupabasePublishableKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError && !/email not confirmed/i.test(signInError.message)) {
      return NextResponse.json({ error: signInError.message }, { status: 401 });
    }

    const result = await confirmSupabaseUserByEmail(email);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, email, user_id: result.userId });
  } catch (error) {
    console.error("Client manager confirm failed:", error);
    return NextResponse.json({ error: "Failed to confirm account." }, { status: 500 });
  }
}
