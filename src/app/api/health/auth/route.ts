import { NextResponse } from "next/server";
import {
  AUTH_UNHEALTHY_BANNER_TTL_MS,
  isAuthRecentlyUnhealthy,
  readAuthHealthRecord,
} from "@/lib/supabase/auth-health";
import { requireAuthenticated } from "@/lib/auth/session";

export async function GET() {
  const record = await readAuthHealthRecord();
  const degraded = isAuthRecentlyUnhealthy(record);
  const publicPayload = {
    ok: !degraded,
    degraded,
    message: degraded
      ? "Authentication service was recently unavailable — sign-in may fail until it recovers."
      : null,
    lastCheckedAt: record.lastCheckedAt || null,
    bannerTtlMs: AUTH_UNHEALTHY_BANNER_TTL_MS,
  };

  try {
    const session = await requireAuthenticated();
    if (session?.isAdmin) {
      return NextResponse.json({
        ...publicPayload,
        admin: {
          healthy: record.healthy,
          statusCode: record.statusCode,
          latencyMs: record.latencyMs,
          error: record.error,
          consecutiveFailures: record.consecutiveFailures,
          lastFailureAt: record.lastFailureAt,
          lastRestartAttemptAt: record.lastRestartAttemptAt,
          lastRestartResult: record.lastRestartResult,
          lastAlertAt: record.lastAlertAt,
          restartConfigured: Boolean(process.env.SUPABASE_ACCESS_TOKEN?.trim()),
        },
      });
    }
  } catch {
    // Public status only for unauthenticated callers.
  }

  return NextResponse.json(publicPayload);
}
