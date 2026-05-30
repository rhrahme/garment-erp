import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types/database";
import { DEMO_MODE, DEMO_USER_EMAIL_COOKIE } from "@/lib/auth/demo-mode";
import { isSuperAdminEmail, isSuperAdminRole } from "@/lib/auth/permissions";

export interface SessionContext {
  userId: string | null;
  email: string | null;
  role: UserRole | null;
  isSuperAdmin: boolean;
}

export async function getSessionContext(): Promise<SessionContext> {
  if (DEMO_MODE) {
    const cookieStore = await cookies();
    const email = cookieStore.get(DEMO_USER_EMAIL_COOKIE)?.value?.trim().toLowerCase() ?? null;
    const isSuperAdmin = isSuperAdminEmail(email);
    return {
      userId: email,
      email,
      role: isSuperAdmin ? "super_admin" : "viewer",
      isSuperAdmin,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { userId: null, email: null, role: null, isSuperAdmin: false };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = (profile?.role as UserRole | undefined) ?? null;

  return {
    userId: user.id,
    email: user.email ?? null,
    role,
    isSuperAdmin: isSuperAdminRole(role) || isSuperAdminEmail(user.email),
  };
}

export async function requireSuperAdmin(): Promise<SessionContext | null> {
  const session = await getSessionContext();
  if (!session.isSuperAdmin) return null;
  return session;
}
