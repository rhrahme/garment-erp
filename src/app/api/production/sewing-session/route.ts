import { NextRequest, NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSewingScanFailuresAsync } from "@/lib/data/sewing-scan-failures";
import {
  ensureStitchKioskLunchGate,
  STITCH_KIOSK_LUNCH_AUTO_PAUSE_ACTOR,
  STITCH_KIOSK_LUNCH_AUTO_RESUME_ACTOR,
} from "@/lib/data/stitch-kiosk-settings";
import { notifyIntegration } from "@/lib/integrations";
import { isStitchLunchClockWindow } from "@/lib/production/stitch-kiosk-lunch";
import {
  parseSewingDashboardPeriod,
  sewingSessionsDashboard,
} from "@/lib/production/sewing-session";
import { ensureForgottenSessionsClosedAtWorkdayEnd } from "@/lib/production/sewing-session-workday-end";

export async function GET(request: NextRequest) {
  try {
    await ensureDocumentsLoaded([
      "sewing_sessions",
      "sewing_scan_failures",
      "sales_orders",
      "payroll_employees",
      "clients",
      "stitch_kiosk_settings",
    ]);
    const failures = await readSewingScanFailuresAsync();
    const workday = await ensureForgottenSessionsClosedAtWorkdayEnd();
    const store = workday.store;
    const lunchGate = await ensureStitchKioskLunchGate();
    if (lunchGate.paused) {
      void notifyIntegration("production.stitch_kiosk_pause_updated", {
        paused: lunchGate.settings.paused,
        paused_at: lunchGate.settings.paused_at,
        paused_by: lunchGate.settings.paused_by,
        resumed_at: lunchGate.settings.resumed_at,
        resumed_by: lunchGate.settings.resumed_by,
        auto_resume_at: lunchGate.settings.auto_resume_at ?? null,
        updated_at: lunchGate.settings.updated_at,
        updated_by: STITCH_KIOSK_LUNCH_AUTO_PAUSE_ACTOR,
        reason: "lunch_auto_pause",
      });
    }
    if (lunchGate.resumed) {
      void notifyIntegration("production.stitch_kiosk_pause_updated", {
        paused: lunchGate.settings.paused,
        paused_at: lunchGate.settings.paused_at,
        paused_by: lunchGate.settings.paused_by,
        resumed_at: lunchGate.settings.resumed_at,
        resumed_by: lunchGate.settings.resumed_by,
        auto_resume_at: lunchGate.settings.auto_resume_at ?? null,
        updated_at: lunchGate.settings.updated_at,
        updated_by: STITCH_KIOSK_LUNCH_AUTO_RESUME_ACTOR,
        reason: "lunch_auto_resume",
      });
    }
    const kioskSettings = lunchGate.settings;
    const { searchParams } = request.nextUrl;
    const period = parseSewingDashboardPeriod(searchParams.get("period"));
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const dashboard = sewingSessionsDashboard(store, Date.now(), {
      period,
      from,
      to,
      failed_scans: failures.failures,
    });
    return NextResponse.json({
      ...dashboard,
      kiosk_paused: kioskSettings.paused,
      kiosk_paused_at: kioskSettings.paused_at,
      kiosk_paused_by: kioskSettings.paused_by,
      kiosk_lunch_active: isStitchLunchClockWindow(),
      kiosk_pause_intervals: kioskSettings.pause_intervals ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load sewing sessions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
