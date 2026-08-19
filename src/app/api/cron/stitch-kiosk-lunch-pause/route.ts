import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verify-cron-secret";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  ensureStitchKioskLunchAutoPause,
  STITCH_KIOSK_LUNCH_AUTO_PAUSE_ACTOR,
} from "@/lib/data/stitch-kiosk-settings";
import { notifyIntegration } from "@/lib/integrations";

/**
 * Daily 14:00 Asia/Riyadh (= 11:00 UTC): pause the stitch kiosk for lunch.
 * Elapsed already excludes 14:00-16:00 even without this; the gate blocks scans.
 */
async function handleCron(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    await ensureDocumentsLoaded(["stitch_kiosk_settings"]);
    const result = await ensureStitchKioskLunchAutoPause();
    if (result.paused) {
      await notifyIntegration("production.stitch_kiosk_pause_updated", {
        paused: result.settings.paused,
        paused_at: result.settings.paused_at,
        paused_by: result.settings.paused_by,
        resumed_at: result.settings.resumed_at,
        resumed_by: result.settings.resumed_by,
        auto_resume_at: result.settings.auto_resume_at ?? null,
        updated_at: result.settings.updated_at,
        updated_by: STITCH_KIOSK_LUNCH_AUTO_PAUSE_ACTOR,
        reason: "lunch_auto_pause",
      });
    }
    console.info(
      "[stitch-kiosk-lunch-pause]",
      JSON.stringify({
        paused: result.paused,
        kiosk_paused: result.settings.paused,
        paused_at: result.settings.paused_at,
        paused_by: result.settings.paused_by,
      })
    );
    return NextResponse.json({
      ok: true,
      paused: result.paused,
      settings: {
        paused: result.settings.paused,
        paused_at: result.settings.paused_at,
        paused_by: result.settings.paused_by,
        auto_resume_at: result.settings.auto_resume_at ?? null,
      },
    });
  } catch (error) {
    console.error("[stitch-kiosk-lunch-pause] failed:", error);
    const message =
      error instanceof Error ? error.message : "Stitch kiosk lunch pause cron failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}
