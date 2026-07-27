import { NextResponse } from "next/server";
import { requireShipmentManageAccess, requireShipmentViewAccess } from "@/lib/auth/session";
import { isTrack17Configured } from "@/lib/integrations/track17/config";
import { syncShipmentsWith17Track } from "@/lib/integrations/track17/sync-shipments";

export async function GET() {
  const session = await requireShipmentViewAccess();
  if (!session) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  return NextResponse.json({
    configured: isTrack17Configured(),
    webhook_url_hint:
      "Set your 17TRACK webhook to: https://YOUR-DOMAIN/api/webhooks/17track (use ngrok for local dev)",
  });
}

export async function POST() {
  const session = await requireShipmentManageAccess();
  if (!session) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    if (!isTrack17Configured()) {
      return NextResponse.json(
        { error: "17TRACK is not configured. Add TRACK17_API_KEY to .env.local." },
        { status: 400 }
      );
    }

    const result = await syncShipmentsWith17Track();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync tracking.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
