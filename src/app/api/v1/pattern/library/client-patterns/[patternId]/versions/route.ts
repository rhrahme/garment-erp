import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { ensurePatternLibraryLoaded } from "@/lib/data/pattern-library";
import { addClientPatternVersion } from "@/lib/pattern-library/mutations";

export async function POST(request: Request, context: { params: Promise<{ patternId: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternLibraryLoaded();
    const { patternId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const result = await addClientPatternVersion(patternId, body, {
      createdBy: typeof body.created_by === "string" ? body.created_by : "api",
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(
      { pattern: result.pattern, version: result.version, source: "api" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to add trial version (API):", error);
    return NextResponse.json({ error: "Failed to add trial version." }, { status: 500 });
  }
}
