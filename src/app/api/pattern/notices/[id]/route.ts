import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { acknowledgePatternOperatorNotice } from "@/lib/pattern/pattern-operator-notice-actions";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!session.isAdmin && !session.isPatternOperator) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await ensureDocumentsLoaded(["pattern_operator_notices"]);
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { action?: string };
    if (body.action !== "acknowledge") {
      return NextResponse.json(
        { error: 'action must be "acknowledge".' },
        { status: 400 }
      );
    }
    const notice = await acknowledgePatternOperatorNotice(
      id,
      session.email ?? "pattern"
    );
    if (!notice) {
      return NextResponse.json({ error: "Notice not found." }, { status: 404 });
    }
    return NextResponse.json({ notice });
  } catch (error) {
    console.error("Failed to acknowledge Pattern operator notice:", error);
    return NextResponse.json({ error: "Failed to update notice." }, { status: 500 });
  }
}
