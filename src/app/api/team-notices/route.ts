import { NextResponse } from "next/server";
import { requireAuthenticated, sessionActor } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  ensureAllPatternHowToNotices,
  listOpenTeamHowToNotices,
} from "@/lib/pattern/pattern-operator-notice-actions";

/** Open all-teams how-tos for the signed-in person (site-wide highlight). */
export async function GET() {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await ensureDocumentsLoaded(["pattern_operator_notices"]);
  try {
    await ensureAllPatternHowToNotices(session.email ?? "system");
  } catch (error) {
    console.error("Failed to ensure all-teams how-to notices:", error);
  }

  const notices = listOpenTeamHowToNotices(sessionActor(session));
  return NextResponse.json({ notices });
}
