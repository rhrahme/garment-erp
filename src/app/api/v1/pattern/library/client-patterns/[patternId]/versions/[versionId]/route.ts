import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { ensurePatternLibraryLoaded } from "@/lib/data/pattern-library";
import {
  finalizeClientPatternVersion,
  updateClientPatternVersion,
} from "@/lib/pattern-library/mutations";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ patternId: string; versionId: string }> }
) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternLibraryLoaded();
    const { patternId, versionId } = await context.params;
    const body = await request.json();
    const actor = typeof body.updated_by === "string" ? body.updated_by : "api";

    if (body.action === "finalize" || body.action === "unfinalize") {
      const result = await finalizeClientPatternVersion(patternId, versionId, {
        finalizedBy: actor,
        final: body.action === "finalize",
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ pattern: result.pattern, version: result.version, source: "api" });
    }

    const result = await updateClientPatternVersion(patternId, versionId, body, {
      updatedBy: actor,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ pattern: result.pattern, version: result.version, source: "api" });
  } catch (error) {
    console.error("Failed to update trial version (API):", error);
    return NextResponse.json({ error: "Failed to update trial version." }, { status: 500 });
  }
}
