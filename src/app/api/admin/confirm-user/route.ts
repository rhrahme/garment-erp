import { NextResponse } from "next/server";
import { confirmSupabaseUserByEmail } from "@/lib/auth/confirm-supabase-user";
import { requireSuperAdmin } from "@/lib/auth/session";

export async function POST(request: Request) {
  const session = await requireSuperAdmin();
  if (!session) {
    return NextResponse.json({ error: "Super admin access required." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim() ?? "";
    if (!email) {
      return NextResponse.json({ error: "email is required." }, { status: 400 });
    }

    const result = await confirmSupabaseUserByEmail(email);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, email, user_id: result.userId });
  } catch (error) {
    console.error("Failed to confirm user:", error);
    return NextResponse.json({ error: "Failed to confirm user." }, { status: 500 });
  }
}
