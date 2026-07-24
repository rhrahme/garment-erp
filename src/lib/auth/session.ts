import { cookies } from "next/headers";
import { withSupabaseTimeout } from "@/lib/auth/supabase-timeout";
import { resolveAuthUser } from "@/lib/auth/resolve-auth-user";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types/database";
import { DEMO_MODE, DEMO_USER_EMAIL_COOKIE } from "@/lib/auth/demo-mode";
import { DEV_IMPERSONATION_COOKIE, resolveDevImpersonationEmail } from "@/lib/auth/dev-impersonation";
import {
  canViewClientContact,
  canAccessPatternModule,
  isAdminEmail,
  isAdminRole,
  isClientManagerAccess,
  isProductionOperatorAccess,
  isSalesOperatorAccess,
  isSuperAdminEmail,
  isSuperAdminRole,
  isTaskOperatorAccess,
  resolveRestrictedAccess,
} from "@/lib/auth/permissions";

export interface SessionContext {
  userId: string | null;
  email: string | null;
  role: UserRole | null;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isClientManager: boolean;
  isTaskOperator: boolean;
  isProductionOperator: boolean;
  isSalesOperator: boolean;
  canViewClientContact: boolean;
  canViewFabricListPrices: boolean;
  canAccessPattern: boolean;
}

function resolveSessionFlags(role: UserRole | null, email: string | null): Omit<SessionContext, "userId" | "email"> {
  const isSuperAdmin = isSuperAdminRole(role) || isSuperAdminEmail(email);
  const isClientManager = !isSuperAdmin && isClientManagerAccess(role, email);
  const isTaskOperator = !isSuperAdmin && isTaskOperatorAccess(role, email);
  const isProductionOperator =
    !isSuperAdmin &&
    !isClientManager &&
    !isTaskOperator &&
    isProductionOperatorAccess(role, email);
  const isSalesOperator =
    !isSuperAdmin &&
    !isClientManager &&
    !isTaskOperator &&
    !isProductionOperator &&
    isSalesOperatorAccess(role, email);
  const isAdmin =
    isSuperAdmin ||
    (!isClientManager &&
      !isTaskOperator &&
      !isProductionOperator &&
      !isSalesOperator &&
      (isAdminRole(role) || isAdminEmail(email)));
  const effectiveRole: UserRole | null = isSuperAdmin
    ? "super_admin"
    : isAdmin
      ? "admin"
      : isClientManager
        ? "client_manager"
        : isTaskOperator
          ? "task_operator"
          : isProductionOperator
            ? "production_operator"
            : isSalesOperator
              ? "sales_operator"
              : role;

  return {
    role: effectiveRole,
    isSuperAdmin,
    isAdmin,
    isClientManager,
    isTaskOperator,
    isProductionOperator,
    isSalesOperator,
    canViewClientContact: canViewClientContact(role, email, isSuperAdmin),
    canViewFabricListPrices: isAdmin,
    canAccessPattern:
      !isSalesOperator &&
      canAccessPatternModule(isClientManager, isAdmin, isTaskOperator, isProductionOperator),
  };
}

export async function getSessionContext(): Promise<SessionContext> {
  if (DEMO_MODE) {
    const cookieStore = await cookies();
    const email = cookieStore.get(DEMO_USER_EMAIL_COOKIE)?.value?.trim().toLowerCase() ?? null;
    return {
      userId: email,
      email,
      ...resolveSessionFlags(null, email),
    };
  }

  const cookieStore = await cookies();
  const impersonatedEmail = resolveDevImpersonationEmail(
    cookieStore.get(DEV_IMPERSONATION_COOKIE)?.value
  );
  if (impersonatedEmail) {
    // Email-list priority (production before sales) — never probe with a forced sales role.
    const role = resolveRestrictedAccess(null, impersonatedEmail, false);
    return {
      userId: `dev:${impersonatedEmail}`,
      email: impersonatedEmail,
      ...resolveSessionFlags(role, impersonatedEmail),
    };
  }

  const supabase = await createClient();
  const user = await resolveAuthUser(supabase);

  if (!user) {
    return {
      userId: null,
      email: null,
      role: null,
      isSuperAdmin: false,
      isAdmin: false,
      isClientManager: false,
      isTaskOperator: false,
      isProductionOperator: false,
      isSalesOperator: false,
      canViewClientContact: false,
      canViewFabricListPrices: false,
      canAccessPattern: false,
    };
  }

  const { data: profile } = await withSupabaseTimeout(
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    "getSessionContext profile",
    { data: null }
  );

  const role = (profile?.role as UserRole | undefined) ?? null;
  const email = user.email?.trim().toLowerCase() ?? null;

  return {
    userId: user.id,
    email,
    ...resolveSessionFlags(role, email),
  };
}

export async function requireAuthenticated(): Promise<SessionContext | null> {
  const session = await getSessionContext();
  if (!session.userId && !session.email) return null;
  return session;
}

export async function requireAdmin(): Promise<SessionContext | null> {
  const session = await getSessionContext();
  if (!session.isAdmin) return null;
  return session;
}

/** Admin or factory manager — operational floors (e.g. AWB tracking) without accounting roles. */
export async function requireFactoryOpsAccess(): Promise<SessionContext | null> {
  const session = await getSessionContext();
  if (!session.userId && !session.email) return null;
  if (session.isAdmin || session.isProductionOperator) return session;
  return null;
}

export async function requireSuperAdmin(): Promise<SessionContext | null> {
  const session = await getSessionContext();
  if (!session.isSuperAdmin) return null;
  return session;
}

export async function requirePatternAccess(): Promise<SessionContext | null> {
  const session = await getSessionContext();
  if (!session.canAccessPattern) return null;
  return session;
}

/** Task / production operators may read orders for floor work but cannot create or edit them. */
export function canModifySalesOrders(session: SessionContext): boolean {
  return !session.isTaskOperator && !session.isProductionOperator;
}
