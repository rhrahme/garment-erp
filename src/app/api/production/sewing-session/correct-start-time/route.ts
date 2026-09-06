import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { correctSewingSessionStartTime } from "@/lib/production/correct-session-start-time";

function canCorrect(session: NonNullable<Awaited<ReturnType<typeof requireAuthenticated>>>): boolean {
  return (
    session.isAdmin ||
    session.isClientManager ||
    session.isStitchOperator ||
    session.isPatternOperator ||
    session.isProductionOperator
  );
}

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticated();
    if (!session || !canCorrect(session)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      session_id?: string | null;
      started_at?: string | null;
      reason?: string | null;
    } | null;

    const actor = (session.email ?? session.userId ?? "unknown").trim() || "unknown";
    const result = await correctSewingSessionStartTime({
      session_id: body?.session_id ?? "",
      started_at: body?.started_at ?? "",
      reason: body?.reason,
      requested_by: actor,
      source: "erp",
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
