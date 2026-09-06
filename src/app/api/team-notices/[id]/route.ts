import { NextResponse } from "next/server";
import { requireAuthenticated, sessionActor } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { acknowledgeTeamHowToNotice } from "@/lib/pattern/pattern-operator-notice-actions";
import { isAllTeamsHowTo } from "@/lib/pattern/pattern-operator-notice-copy";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await ensureDocumentsLoaded(["pattern_operator_notices"]);
  try {
    const { id } = await context.params;
    if (!isAllTeamsHowTo(id)) {
      return NextResponse.json({ error: "Notice not found." }, { status: 404 });
    }
    const body = (await request.json()) as { action?: string };
    if (body.action !== "acknowledge") {
      return NextResponse.json({ error: 'action must be "acknowledge".' }, { status: 400 });
    }
    const notice = await acknowledgeTeamHowToNotice(id, sessionActor(session));
    if (!notice) {
      return NextResponse.json({ error: "Notice not found." }, { status: 404 });
    }
    return NextResponse.json({ notice });
  } catch (error) {
    console.error("Failed to acknowledge all-teams how-to:", error);
    return NextResponse.json({ error: "Failed to update notice." }, { status: 500 });
  }
}
