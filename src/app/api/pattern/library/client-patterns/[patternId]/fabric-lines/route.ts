import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import { ensurePatternLibraryLoaded } from "@/lib/data/pattern-library";
import {
  assignFabricLinesToClientPattern,
  unassignFabricLinesFromClientPattern,
} from "@/lib/pattern-library/mutations";

function parseLineIds(body: unknown): string[] {
  const raw = (body as { line_ids?: unknown })?.line_ids;
  return Array.isArray(raw) ? raw.map((id) => `${id}`) : [];
}

/** Assign fabric lines to this garment/pattern (reassigns from other patterns). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ patternId: string }> }
) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternLibraryLoaded();
    const { patternId } = await params;
    const body = await request.json().catch(() => null);
    const result = await assignFabricLinesToClientPattern(patternId, parseLineIds(body), {
      assignedBy: session.email,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ pattern: result.pattern });
  } catch (error) {
    console.error("Failed to assign fabric lines to client pattern:", error);
    return NextResponse.json({ error: "Failed to assign fabric lines." }, { status: 500 });
  }
}

/** Unassign fabric lines from this garment/pattern. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ patternId: string }> }
) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternLibraryLoaded();
    const { patternId } = await params;
    const body = await request.json().catch(() => null);
    const result = await unassignFabricLinesFromClientPattern(patternId, parseLineIds(body), {
      unassignedBy: session.email,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ pattern: result.pattern });
  } catch (error) {
    console.error("Failed to unassign fabric lines from client pattern:", error);
    return NextResponse.json({ error: "Failed to unassign fabric lines." }, { status: 500 });
  }
}
