import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  DEV_IMPERSONATION_COOKIE,
  resolveDevImpersonationEmail,
} from "@/lib/auth/dev-impersonation";
import {
  defaultPathForSession,
  isClientManagerAccess,
  isClientManagerRouteAllowed,
} from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/types/database";
import { withSupabaseTimeout } from "@/lib/auth/supabase-timeout";
import { getSupabasePublishableKey, getSupabaseUrl, isSupabaseConfigured } from "@/lib/supabase/env";

export async function updateSession(request: NextRequest) {
  if (!isSupabaseConfigured()) {
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

  const {
    data: { user },
  } = await withSupabaseTimeout(
    supabase.auth.getUser(),
    "middleware getUser",
    { data: { user: null } }
  );

  const impersonatedEmail = resolveDevImpersonationEmail(
    request.cookies.get(DEV_IMPERSONATION_COOKIE)?.value
  );
  const isAuthenticated = Boolean(impersonatedEmail || user);

  const pathname = request.nextUrl.pathname;
  const isAuthPage = pathname.startsWith("/login");
  const isApiRoute = pathname.startsWith("/api/");
  const isPublicApiRoute = pathname.startsWith("/api/v1/") || pathname.startsWith("/api/webhooks/");
  const isOpenAuthRoute =
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/dev-impersonate") ||
    pathname.startsWith("/api/auth/confirm-client-manager") ||
    pathname.startsWith("/api/qr");

  if (!isAuthenticated && !isAuthPage && !isPublicApiRoute && !isOpenAuthRoute) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const email = impersonatedEmail ?? user?.email?.trim().toLowerCase() ?? null;
  let isClientManager = false;
  if (impersonatedEmail) {
    isClientManager = isClientManagerAccess("client_manager", impersonatedEmail);
  } else if (user?.id && email) {
    const { data: profile } = await withSupabaseTimeout(
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      "middleware profile",
      { data: null }
    );
    isClientManager = isClientManagerAccess((profile?.role as UserRole | undefined) ?? null, email);
  }

  if (isAuthenticated && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = defaultPathForSession(isClientManager);
    return NextResponse.redirect(url);
  }

  if (isAuthenticated && isClientManager && !isClientManagerRouteAllowed(pathname)) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    const url = request.nextUrl.clone();
    url.pathname = defaultPathForSession(true);
    return NextResponse.redirect(url);
  }

  if (isAuthenticated && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = defaultPathForSession(isClientManager);
    return NextResponse.redirect(url);
  }

  if (isAuthenticated && pathname === "/dashboard" && isClientManager) {
    const url = request.nextUrl.clone();
    url.pathname = defaultPathForSession(true);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
