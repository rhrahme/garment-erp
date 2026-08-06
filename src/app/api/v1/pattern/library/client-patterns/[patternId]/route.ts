import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import {
  ensurePatternLibraryLoaded,
  getClientPatternByIdFresh,
} from "@/lib/data/pattern-library";
import {
  updateClientPattern,
  updateClientPatternTrialSheet,
} from "@/lib/pattern-library/mutations";

export async function GET(request: Request, context: { params: Promise<{ patternId: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternLibraryLoaded();
    const { patternId } = await context.params;
    const pattern = await getClientPatternByIdFresh(patternId);
    if (!pattern) {
      return NextResponse.json({ error: "Client pattern not found." }, { status: 404 });
    }
    return NextResponse.json({ pattern });
  } catch (error) {
    console.error("Failed to read client pattern (API):", error);
    return NextResponse.json({ error: "Failed to load client pattern." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ patternId: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternLibraryLoaded();
    const { patternId } = await context.params;
    const body = await request.json();
    const updatedBy = typeof body.updated_by === "string" ? body.updated_by : "api";

    if (Array.isArray(body?.trial_sheet_versions)) {
      const result = await updateClientPatternTrialSheet(
        patternId,
        body.trial_sheet_versions,
        { updatedBy }
      );
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ pattern: result.pattern, source: "api" });
    }

    const result = await updateClientPattern(patternId, body, { updatedBy });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ pattern: result.pattern, source: "api" });
  } catch (error) {
    console.error("Failed to update client pattern (API):", error);
    return NextResponse.json({ error: "Failed to update client pattern." }, { status: 500 });
  }
}
