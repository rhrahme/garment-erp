import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { resetSewingSessionsForTesting } from "@/lib/production/sewing-session-reset";

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      clear_history?: boolean;
      clear_failures?: boolean;
      clear_alteration_pending?: boolean;
      cleared_by?: string | null;
    };

    const result = await resetSewingSessionsForTesting(
      {
        clear_history: body.clear_history,
        clear_failures: body.clear_failures,
        clear_alteration_pending: body.clear_alteration_pending,
        cleared_by: body.cleared_by ?? "api",
      },
      "api"
    );

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reset sewing sessions.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
