import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthUser } from "@/lib/auth/resolve-auth-user";
import {
  DEV_IMPERSONATION_COOKIE,
  resolveDevImpersonationEmail,
} from "@/lib/auth/dev-impersonation";
import {
  defaultPathForSession,
  landingAccessFromRestricted,
  resolveRestrictedAccess,
  isRestrictedRouteAllowed,
  isSuperAdminEmail,
  isSuperAdminRole,
} from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/types/database";
import { withSupabaseTimeout } from "@/lib/auth/supabase-timeout";
import { getRemovedSalesOrderRedirect } from "@/lib/sales-orders/removed-order-redirects";
import { getSupabasePublishableKey, getSupabaseUrl, isSupabaseConfigured } from "@/lib/supabase/env";

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => cookie.name.includes("-auth-token"));
}

export async function updateSession(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  const pathname = request.nextUrl.pathname;
  const isAuthPage = pathname.startsWith("/login");
  const isApiRoute = pathname.startsWith("/api/");
  const isPublicApiRoute =
    pathname.startsWith("/api/v1/") ||
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/cron/") ||
    pathname === "/api/health/auth";
  const isOpenAuthRoute =
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/dev-impersonate") ||
    pathname.startsWith("/api/auth/confirm-client-manager") ||
    pathname === "/api/qr";

  const impersonatedEmail = resolveDevImpersonationEmail(
    request.cookies.get(DEV_IMPERSONATION_COOKIE)?.value
  );

  // Anonymous hits to login/health/open routes skip GoTrue when no session cookie exists.
  if (
    !impersonatedEmail &&
    !hasSupabaseAuthCookie(request) &&
    (isAuthPage || isPublicApiRoute || isOpenAuthRoute)
  ) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const user = await resolveAuthUser(supabase);
  const isAuthenticated = Boolean(impersonatedEmail || user);

  if (!isAuthenticated && !isAuthPage && !isPublicApiRoute && !isOpenAuthRoute) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const email = impersonatedEmail ?? user?.email?.trim().toLowerCase() ?? null;
  let role: UserRole | null = null;
  let isSuperAdmin = false;
  if (impersonatedEmail) {
    // Email-list priority (production before sales) — never probe with a forced sales role.
    role = resolveRestrictedAccess(null, impersonatedEmail, false);
    isSuperAdmin = isSuperAdminEmail(impersonatedEmail);
  } else if (user?.id && email) {
    const { data: profile } = await withSupabaseTimeout(
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      "middleware profile",
      { data: null }
    );
    role = (profile?.role as UserRole | undefined) ?? null;
    isSuperAdmin = isSuperAdminRole(role) || isSuperAdminEmail(email);
  } else if (email) {
    isSuperAdmin = isSuperAdminEmail(email);
  }

  const restrictedAccess = resolveRestrictedAccess(role, email, isSuperAdmin);
  const landing = landingAccessFromRestricted(restrictedAccess);

  if (isAuthenticated && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = defaultPathForSession(landing);
    return NextResponse.redirect(url);
  }

  if (isAuthenticated && restrictedAccess && !isRestrictedRouteAllowed(pathname, restrictedAccess)) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    const url = request.nextUrl.clone();
    url.pathname = defaultPathForSession(landing);
    return NextResponse.redirect(url);
  }

  if (isAuthenticated && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = defaultPathForSession(landing);
    return NextResponse.redirect(url);
  }

  if (isAuthenticated && pathname === "/dashboard" && restrictedAccess) {
    const url = request.nextUrl.clone();
    url.pathname = defaultPathForSession(landing);
    return NextResponse.redirect(url);
  }

  if (isAuthenticated && !isApiRoute) {
    const removedRedirect = getRemovedSalesOrderRedirect(pathname);
    if (removedRedirect) {
      const url = request.nextUrl.clone();
      const [path, search = ""] = removedRedirect.split("?");
      url.pathname = path;
      url.search = search ? `?${search}` : "";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
