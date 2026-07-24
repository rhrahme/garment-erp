import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import { ensurePatternLibraryLoaded } from "@/lib/data/pattern-library";
import { addClientPatternVersion } from "@/lib/pattern-library/mutations";

export async function POST(request: Request, context: { params: Promise<{ patternId: string }> }) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternLibraryLoaded();
    const { patternId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const result = await addClientPatternVersion(patternId, body, { createdBy: session.email });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ pattern: result.pattern, version: result.version }, { status: 201 });
  } catch (error) {
    console.error("Failed to add trial version:", error);
    return NextResponse.json({ error: "Failed to add trial version." }, { status: 500 });
  }
}
