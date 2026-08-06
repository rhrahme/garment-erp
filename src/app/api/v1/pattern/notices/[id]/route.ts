import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { acknowledgePatternOperatorNotice } from "@/lib/pattern/pattern-operator-notice-actions";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  await ensureDocumentsLoaded(["pattern_operator_notices"]);
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { action?: string; by?: string };
    if (body.action !== "acknowledge") {
      return NextResponse.json(
        { error: 'action must be "acknowledge".' },
        { status: 400 }
      );
    }
    const notice = await acknowledgePatternOperatorNotice(id, body.by?.trim() || "api");
    if (!notice) {
      return NextResponse.json({ error: "Notice not found." }, { status: 404 });
    }
    return NextResponse.json({ notice, source: "api" });
  } catch (error) {
    console.error("Failed to acknowledge Pattern operator notice (API):", error);
    return NextResponse.json({ error: "Failed to update notice." }, { status: 500 });
  }
}
