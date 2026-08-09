import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  readStitchKioskSettings,
  setStitchKioskPaused,
} from "@/lib/data/stitch-kiosk-settings";
import { notifyIntegration } from "@/lib/integrations";

export async function GET() {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }
    await ensureDocumentsLoaded(["stitch_kiosk_settings"]);
    const settings = await readStitchKioskSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load kiosk pause state.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }
    const body = (await request.json().catch(() => null)) as { paused?: unknown } | null;
    if (typeof body?.paused !== "boolean") {
      return NextResponse.json({ error: "paused (boolean) is required." }, { status: 400 });
    }
    await ensureDocumentsLoaded(["stitch_kiosk_settings"]);
    const settings = await setStitchKioskPaused(body.paused, {
      actedBy: session.email ?? session.userId,
    });
    await notifyIntegration("production.stitch_kiosk_pause_updated", {
      paused: settings.paused,
      paused_at: settings.paused_at,
      paused_by: settings.paused_by,
      resumed_at: settings.resumed_at,
      resumed_by: settings.resumed_by,
      updated_at: settings.updated_at,
      updated_by: session.email ?? session.userId,
    });
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update kiosk pause state.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
