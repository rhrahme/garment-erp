import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verify-cron-secret";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { ensureForgottenSessionsClosedAtWorkdayEnd } from "@/lib/production/sewing-session-workday-end";

/**
 * Daily 22:00 Asia/Riyadh (= 19:00 UTC): close leftover Live sessions.
 * Floor finishes at 10 PM - forgotten rows must not keep running overnight.
 */
async function handleCron(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    await ensureDocumentsLoaded(["sewing_sessions", "stitch_kiosk_settings"]);
    const result = await ensureForgottenSessionsClosedAtWorkdayEnd();
    console.info(
      "[stitch-kiosk-workday-end]",
      JSON.stringify({
        closed: result.closed.length,
        ids: result.closed.map((session) => session.id),
      })
    );
    return NextResponse.json({
      ok: true,
      closed: result.closed.map((session) => ({
        id: session.id,
        employee_name: session.employee_name,
        production_code: session.production_code,
        ended_at: session.ended_at,
        duration_sec: session.duration_sec,
      })),
    });
  } catch (error) {
    console.error("[stitch-kiosk-workday-end] failed:", error);
    const message =
      error instanceof Error ? error.message : "Stitch kiosk workday-end cron failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}
