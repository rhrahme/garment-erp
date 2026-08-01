import { NextRequest, NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSewingSessionsAsync } from "@/lib/data/sewing-sessions";
import {
  parseSewingDashboardPeriod,
  sewingSessionsDashboard,
} from "@/lib/production/sewing-session";

export async function GET(request: NextRequest) {
  try {
    await ensureDocumentsLoaded(["sewing_sessions"]);
    const store = await readSewingSessionsAsync();
    const { searchParams } = request.nextUrl;
    const period = parseSewingDashboardPeriod(searchParams.get("period"));
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const dashboard = sewingSessionsDashboard(store, Date.now(), { period, from, to });
    return NextResponse.json(dashboard);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load sewing sessions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
