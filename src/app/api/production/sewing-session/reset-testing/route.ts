import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { resetSewingSessionsForTesting } from "@/lib/production/sewing-session-reset";

function canResetSewing(
  session: NonNullable<Awaited<ReturnType<typeof requireAuthenticated>>>
): boolean {
  return session.isAdmin || session.isClientManager;
}

export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!canResetSewing(session)) {
    return NextResponse.json({ error: "Admin or QC access required." }, { status: 403 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      clear_history?: boolean;
      clear_failures?: boolean;
      clear_alteration_pending?: boolean;
    };

    const result = await resetSewingSessionsForTesting({
      clear_history: body.clear_history,
      clear_failures: body.clear_failures,
      clear_alteration_pending: body.clear_alteration_pending,
      cleared_by: session.email ?? "admin",
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reset sewing sessions.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
