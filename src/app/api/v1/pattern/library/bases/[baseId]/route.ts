import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { ensurePatternLibraryLoaded, getBasePatternByIdFresh } from "@/lib/data/pattern-library";
import { updateBasePattern } from "@/lib/pattern-library/mutations";

export async function GET(request: Request, context: { params: Promise<{ baseId: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternLibraryLoaded();
    const { baseId } = await context.params;
    const base = await getBasePatternByIdFresh(baseId);
    if (!base) {
      return NextResponse.json({ error: "Base pattern not found." }, { status: 404 });
    }
    return NextResponse.json({ base });
  } catch (error) {
    console.error("Failed to read base pattern (API):", error);
    return NextResponse.json({ error: "Failed to load base pattern." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ baseId: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternLibraryLoaded();
    const { baseId } = await context.params;
    const body = await request.json();
    const result = await updateBasePattern(baseId, body, {
      updatedBy: typeof body.updated_by === "string" ? body.updated_by : "api",
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ base: result.base, source: "api" });
  } catch (error) {
    console.error("Failed to update base pattern (API):", error);
    return NextResponse.json({ error: "Failed to update base pattern." }, { status: 500 });
  }
}
