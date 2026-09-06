import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { verifyApiKey } from "@/lib/integrations";
import { acknowledgeTeamHowToNotice } from "@/lib/pattern/pattern-operator-notice-actions";
import { isAllTeamsHowTo } from "@/lib/pattern/pattern-operator-notice-copy";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  await ensureDocumentsLoaded(["pattern_operator_notices"]);
  try {
    const { id } = await context.params;
    if (!isAllTeamsHowTo(id)) {
      return NextResponse.json({ error: "Notice not found." }, { status: 404 });
    }
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      actor?: string;
    };
    if (body.action !== "acknowledge") {
      return NextResponse.json({ error: 'action must be "acknowledge".' }, { status: 400 });
    }
    const actor = String(body.actor ?? "").trim() || "api";
    const notice = await acknowledgeTeamHowToNotice(id, actor);
    if (!notice) {
      return NextResponse.json({ error: "Notice not found." }, { status: 404 });
    }
    return NextResponse.json({ notice, source: "api" });
  } catch (error) {
    console.error("Failed to acknowledge all-teams how-to (API):", error);
    return NextResponse.json({ error: "Failed to update notice." }, { status: 500 });
  }
}
