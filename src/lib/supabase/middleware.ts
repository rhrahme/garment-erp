import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthUserDetailed } from "@/lib/auth/resolve-auth-user";
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
import { isEmailLoginDisabled } from "@/lib/auth/email-login-disabled";
import { getSupabasePublishableKey, getSupabaseUrl, isSupabaseConfigured } from "@/lib/supabase/env";

function clearAuthCookies(response: NextResponse, request: NextRequest): void {
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.includes("-auth-token") || cookie.name === DEV_IMPERSONATION_COOKIE) {
      response.cookies.set(cookie.name, "", { path: "/", maxAge: 0 });
    }
  }
}

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => cookie.name.includes("-auth-token"));
}

/**
 * Hard ceiling under Vercel's ~25s middleware limit when GoTrue hangs.
 * Must exceed the sum of the inner SUPABASE_AUTH_TIMEOUT_MS caps (getUser +
 * getSession + profile = 12s) so the deliberate degraded handling below runs
 * instead of this blunt fallback.
 */
const MIDDLEWARE_WALL_CLOCK_MS = 15_000;

/**
 * Signed-in user but GoTrue is degraded (timeout/5xx): hold and auto-retry
 * instead of bouncing to /login. Kicking valid sessions to the login page is
 * what made the floor report "cannot login" during a Supabase slowdown.
 */
function degradedAuthHoldResponse(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Auth service is busy. Please retry." },
      { status: 503, headers: { "Retry-After": "4" } }
    );
  }
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="refresh" content="4">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reconnecting...</title>
<style>body{font-family:Helvetica,Arial,sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px 40px;text-align:center;max-width:360px}
.spin{width:28px;height:28px;border:3px solid #e2e8f0;border-top-color:#0f172a;border-radius:50%;margin:0 auto 16px;animation:s 1s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}
h1{font-size:16px;color:#0f172a;margin:0 0 6px}p{font-size:13px;color:#64748b;margin:0}</style>
</head><body><div class="card"><div class="spin"></div>
<h1>Reconnecting to the server</h1>
<p>You are still signed in. This page retries automatically every few seconds.</p>
</div></body></html>`;
  return new NextResponse(html, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": "4",
      "Cache-Control": "no-store",
    },
  });
}

async function updateSessionInner(request: NextRequest) {
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
    // Badge number + password login (pattern team) - no session yet by definition.
    pathname.startsWith("/api/auth/badge-login") ||
    pathname.startsWith("/api/auth/dev-impersonate") ||
    pathname.startsWith("/api/auth/confirm-client-manager") ||
    // One-click approve/reject from the admin email - authorized by a signed
    // token in the link, not a session (admin may be on their phone inbox).
    pathname === "/api/clients/name-change-email-action" ||
    pathname === "/api/admin-approvals/email-action" ||
    // Token-authorized approvals page + batch API (linked from admin emails).
    pathname === "/approvals" ||
    pathname === "/api/admin-approvals" ||
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

  const { user, degraded } = await resolveAuthUserDetailed(supabase);
  const isAuthenticated = Boolean(impersonatedEmail || user);

  if (!isAuthenticated && !isAuthPage && !isPublicApiRoute && !isOpenAuthRoute) {
    // A session cookie exists but GoTrue could not validate it (timeout/5xx).
    // Hold and retry - never dump a signed-in user back onto /login.
    if (degraded && hasSupabaseAuthCookie(request)) {
      return degradedAuthHoldResponse(request);
    }
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const email = impersonatedEmail ?? user?.email?.trim().toLowerCase() ?? null;
  if (isAuthenticated && isEmailLoginDisabled(email)) {
    if (isAuthPage) {
      clearAuthCookies(supabaseResponse, request);
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redirect = NextResponse.redirect(url);
    clearAuthCookies(redirect, request);
    return redirect;
  }
  let role: UserRole | null = null;
  let isSuperAdmin = false;
  if (impersonatedEmail) {
    // Email-list priority (production before sales) - never probe with a forced sales role.
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

function failClosedOnMiddlewareTimeout(request: NextRequest): NextResponse {
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
    // Badge number + password login (pattern team) - no session yet by definition.
    pathname.startsWith("/api/auth/badge-login") ||
    pathname.startsWith("/api/auth/dev-impersonate") ||
    pathname.startsWith("/api/auth/confirm-client-manager") ||
    // One-click approve/reject from the admin email - authorized by a signed
    // token in the link, not a session (admin may be on their phone inbox).
    pathname === "/api/clients/name-change-email-action" ||
    pathname === "/api/admin-approvals/email-action" ||
    // Token-authorized approvals page + batch API (linked from admin emails).
    pathname === "/approvals" ||
    pathname === "/api/admin-approvals" ||
    pathname === "/api/qr";

  if (isAuthPage || isPublicApiRoute || isOpenAuthRoute) {
    return NextResponse.next({ request });
  }
  // Wall-clock timeout with a session cookie present = degraded auth backend,
  // not a logged-out user. Hold and retry instead of failing closed to /login.
  if (hasSupabaseAuthCookie(request)) {
    return degradedAuthHoldResponse(request);
  }
  if (isApiRoute) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export async function updateSession(request: NextRequest) {
  try {
    return await Promise.race([
      updateSessionInner(request),
      new Promise<NextResponse>((resolve) => {
        setTimeout(() => {
          console.warn("[auth] middleware wall-clock timeout; failing closed");
          resolve(failClosedOnMiddlewareTimeout(request));
        }, MIDDLEWARE_WALL_CLOCK_MS);
      }),
    ]);
  } catch (error) {
    console.warn(
      "[auth] middleware updateSession failed:",
      error instanceof Error ? error.message : error
    );
    return failClosedOnMiddlewareTimeout(request);
  }
}
