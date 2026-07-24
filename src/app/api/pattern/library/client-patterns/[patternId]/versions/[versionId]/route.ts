import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import { ensurePatternLibraryLoaded } from "@/lib/data/pattern-library";
import {
  finalizeClientPatternVersion,
  updateClientPatternVersion,
} from "@/lib/pattern-library/mutations";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ patternId: string; versionId: string }> }
) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternLibraryLoaded();
    const { patternId, versionId } = await context.params;
    const body = await request.json();

    if (body.action === "finalize" || body.action === "unfinalize") {
      const result = await finalizeClientPatternVersion(patternId, versionId, {
        finalizedBy: session.email,
        final: body.action === "finalize",
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ pattern: result.pattern, version: result.version });
    }

    const result = await updateClientPatternVersion(patternId, versionId, body, {
      updatedBy: session.email,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ pattern: result.pattern, version: result.version });
  } catch (error) {
    console.error("Failed to update trial version:", error);
    return NextResponse.json({ error: "Failed to update trial version." }, { status: 500 });
  }
}
