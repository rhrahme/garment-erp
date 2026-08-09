import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  readStitchKioskSettings,
  setStitchKioskPaused,
} from "@/lib/data/stitch-kiosk-settings";
import { notifyIntegration, verifyApiKey } from "@/lib/integrations";

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  try {
    await ensureDocumentsLoaded(["stitch_kiosk_settings"]);
    const settings = await readStitchKioskSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load kiosk pause state.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  try {
    const body = (await request.json().catch(() => null)) as {
      paused?: unknown;
      updated_by?: unknown;
    } | null;
    if (typeof body?.paused !== "boolean") {
      return NextResponse.json({ error: "paused (boolean) is required." }, { status: 400 });
    }
    const actedBy =
      typeof body.updated_by === "string" && body.updated_by.trim()
        ? body.updated_by.trim()
        : "api";
    await ensureDocumentsLoaded(["stitch_kiosk_settings"]);
    const settings = await setStitchKioskPaused(body.paused, { actedBy });
    await notifyIntegration(
      "production.stitch_kiosk_pause_updated",
      {
        paused: settings.paused,
        paused_at: settings.paused_at,
        paused_by: settings.paused_by,
        resumed_at: settings.resumed_at,
        resumed_by: settings.resumed_by,
        updated_at: settings.updated_at,
        updated_by: actedBy,
      },
      "api"
    );
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update kiosk pause state.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
