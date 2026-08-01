import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSewingSessionsAsync } from "@/lib/data/sewing-sessions";
import { sewingSessionsDashboard } from "@/lib/production/sewing-session";

export async function GET() {
  try {
    await ensureDocumentsLoaded(["sewing_sessions"]);
    const store = await readSewingSessionsAsync();
    const dashboard = sewingSessionsDashboard(store);
    return NextResponse.json(dashboard);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load sewing sessions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
