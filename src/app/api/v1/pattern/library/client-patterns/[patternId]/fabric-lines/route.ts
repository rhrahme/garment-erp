import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { ensurePatternLibraryLoaded } from "@/lib/data/pattern-library";
import {
  assignFabricLinesToClientPattern,
  unassignFabricLinesFromClientPattern,
} from "@/lib/pattern-library/mutations";

function parseBody(body: unknown): { lineIds: string[]; actor: string } {
  const raw = (body as { line_ids?: unknown; actor?: unknown }) ?? {};
  return {
    lineIds: Array.isArray(raw.line_ids) ? raw.line_ids.map((id) => `${id}`) : [],
    actor: typeof raw.actor === "string" ? raw.actor : "api",
  };
}

/** Zapier/API parity: assign fabric lines to a client pattern. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ patternId: string }> }
) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternLibraryLoaded();
    const { patternId } = await params;
    const { lineIds, actor } = parseBody(await request.json().catch(() => null));
    const result = await assignFabricLinesToClientPattern(patternId, lineIds, {
      assignedBy: actor,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ pattern: result.pattern, source: "api" });
  } catch (error) {
    console.error("Failed to assign fabric lines (API):", error);
    return NextResponse.json({ error: "Failed to assign fabric lines." }, { status: 500 });
  }
}

/** Zapier/API parity: unassign fabric lines from a client pattern. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ patternId: string }> }
) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternLibraryLoaded();
    const { patternId } = await params;
    const { lineIds, actor } = parseBody(await request.json().catch(() => null));
    const result = await unassignFabricLinesFromClientPattern(patternId, lineIds, {
      unassignedBy: actor,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ pattern: result.pattern, source: "api" });
  } catch (error) {
    console.error("Failed to unassign fabric lines (API):", error);
    return NextResponse.json({ error: "Failed to unassign fabric lines." }, { status: 500 });
  }
}
