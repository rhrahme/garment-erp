import { NextResponse } from "next/server";
import { verifyTrack17WebhookSignature } from "@/lib/integrations/track17/client";
import { apply17TrackWebhookPayload } from "@/lib/integrations/track17/sync-shipments";
import type { Track17WebhookBody } from "@/lib/integrations/track17/types";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("sign");

  if (!verifyTrack17WebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: Track17WebhookBody;
  try {
    body = JSON.parse(rawBody) as Track17WebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.event === "TRACKING_UPDATED" && body.data) {
    apply17TrackWebhookPayload(body.data);
  }

  return NextResponse.json({ ok: true });
}
