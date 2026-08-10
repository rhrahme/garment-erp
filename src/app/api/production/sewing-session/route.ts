import { NextRequest, NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSewingScanFailuresAsync } from "@/lib/data/sewing-scan-failures";
import { readSewingSessionsAsync } from "@/lib/data/sewing-sessions";
import {
  ensureStitchKioskLunchAutoResume,
  readStitchKioskSettings,
} from "@/lib/data/stitch-kiosk-settings";
import {
  parseSewingDashboardPeriod,
  sewingSessionsDashboard,
} from "@/lib/production/sewing-session";

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
    const store = await readSewingSessionsAsync();
    const failures = await readSewingScanFailuresAsync();
    await ensureStitchKioskLunchAutoResume({ notify: true });
    const kioskSettings = await readStitchKioskSettings();
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
      kiosk_pause_intervals: kioskSettings.pause_intervals ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load sewing sessions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
