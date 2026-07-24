import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import { ensurePatternLibraryLoaded, readPatternLibraryFresh } from "@/lib/data/pattern-library";
import { createClientPattern } from "@/lib/pattern-library/mutations";

export async function GET() {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternLibraryLoaded();
    const store = await readPatternLibraryFresh();
    return NextResponse.json({ client_patterns: store.client_patterns });
  } catch (error) {
    console.error("Failed to list client patterns:", error);
    return NextResponse.json({ error: "Failed to list client patterns." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternLibraryLoaded();
    const body = await request.json();
    const result = await createClientPattern(body, { createdBy: session.email });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ pattern: result.pattern }, { status: 201 });
  } catch (error) {
    console.error("Failed to create client pattern:", error);
    return NextResponse.json({ error: "Failed to create client pattern." }, { status: 500 });
  }
}
