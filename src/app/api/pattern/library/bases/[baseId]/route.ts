import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import { ensurePatternLibraryLoaded, getBasePatternByIdFresh } from "@/lib/data/pattern-library";
import { updateBasePattern } from "@/lib/pattern-library/mutations";

export async function GET(_request: Request, context: { params: Promise<{ baseId: string }> }) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternLibraryLoaded();
    const { baseId } = await context.params;
    const base = await getBasePatternByIdFresh(baseId);
    if (!base) {
      return NextResponse.json({ error: "Base pattern not found." }, { status: 404 });
    }
    return NextResponse.json({ base });
  } catch (error) {
    console.error("Failed to load base pattern:", error);
    return NextResponse.json({ error: "Failed to load base pattern." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ baseId: string }> }) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternLibraryLoaded();
    const { baseId } = await context.params;
    const body = await request.json();
    const result = await updateBasePattern(baseId, body, { updatedBy: session.email });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ base: result.base });
  } catch (error) {
    console.error("Failed to update base pattern:", error);
    return NextResponse.json({ error: "Failed to update base pattern." }, { status: 500 });
  }
}
