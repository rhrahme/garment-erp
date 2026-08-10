import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verify-cron-secret";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  ensureStitchKioskLunchAutoResume,
  STITCH_KIOSK_LUNCH_AUTO_RESUME_ACTOR,
} from "@/lib/data/stitch-kiosk-settings";
import { notifyIntegration } from "@/lib/integrations";

/**
 * Daily 16:00 Asia/Riyadh (= 13:00 UTC): open the stitch kiosk scan gate
 * after lunch. Does not restart articles - only allows scanning again.
 */
async function handleCron(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    await ensureDocumentsLoaded(["stitch_kiosk_settings"]);
    const result = await ensureStitchKioskLunchAutoResume();
    if (result.resumed) {
      await notifyIntegration("production.stitch_kiosk_pause_updated", {
        paused: result.settings.paused,
        paused_at: result.settings.paused_at,
        paused_by: result.settings.paused_by,
        resumed_at: result.settings.resumed_at,
        resumed_by: result.settings.resumed_by,
        auto_resume_at: result.settings.auto_resume_at ?? null,
        updated_at: result.settings.updated_at,
        updated_by: STITCH_KIOSK_LUNCH_AUTO_RESUME_ACTOR,
        reason: "lunch_auto_resume",
      });
    }
    console.info(
      "[stitch-kiosk-lunch-resume]",
      JSON.stringify({
        resumed: result.resumed,
        paused: result.settings.paused,
        resumed_at: result.settings.resumed_at,
        resumed_by: result.settings.resumed_by,
      })
    );
    return NextResponse.json({
      ok: true,
      resumed: result.resumed,
      settings: {
        paused: result.settings.paused,
        paused_at: result.settings.paused_at,
        resumed_at: result.settings.resumed_at,
        resumed_by: result.settings.resumed_by,
        auto_resume_at: result.settings.auto_resume_at ?? null,
      },
    });
  } catch (error) {
    console.error("[stitch-kiosk-lunch-resume] failed:", error);
    const message =
      error instanceof Error ? error.message : "Stitch kiosk lunch resume cron failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}
