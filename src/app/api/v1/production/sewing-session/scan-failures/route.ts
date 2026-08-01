import { NextRequest, NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSewingScanFailuresAsync } from "@/lib/data/sewing-scan-failures";
import { verifyApiKey } from "@/lib/integrations";
import {
  parseSewingDashboardPeriod,
  sewingFailedScansForPeriod,
} from "@/lib/production/sewing-session";

/**
 * List persisted sewing kiosk scan failures for the period.
 * Failures are written as a side effect of POST /api/v1/production/sewing-session/scan
 * (and the ERP scan route) when a scan is rejected.
 */
export async function GET(request: NextRequest) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensureDocumentsLoaded(["sewing_scan_failures"]);
    const store = await readSewingScanFailuresAsync();
    const { searchParams } = request.nextUrl;
    const period = parseSewingDashboardPeriod(searchParams.get("period"));
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const failures = sewingFailedScansForPeriod(store.failures, Date.now(), {
      period,
      from,
      to,
    });
    return NextResponse.json({
      ok: true,
      period,
      count: failures.length,
      failures,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load sewing scan failures.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
