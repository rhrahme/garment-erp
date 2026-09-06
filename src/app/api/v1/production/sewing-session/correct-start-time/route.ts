import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations";
import { correctSewingSessionStartTime } from "@/lib/production/correct-session-start-time";

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  try {
    const body = (await request.json().catch(() => null)) as {
      session_id?: string | null;
      started_at?: string | null;
      reason?: string | null;
      actor?: string | null;
    } | null;

    const result = await correctSewingSessionStartTime({
      session_id: body?.session_id ?? "",
      started_at: body?.started_at ?? "",
      reason: body?.reason,
      requested_by:
        typeof body?.actor === "string" && body.actor.trim() ? body.actor.trim() : "api",
      source: "api",
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      request_id: result.request_id,
      started_at: result.started_at,
      already_applied: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to correct start time.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
