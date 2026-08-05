import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import {
  ensurePatternLibraryDocLoaded,
  ensurePatternLibraryLoaded,
  readPatternLibraryFresh,
} from "@/lib/data/pattern-library";
import { createBasePattern } from "@/lib/pattern-library/mutations";

/**
 * Slim read used by base-pattern pickers: bases + dictionary only (no
 * client_patterns, which dominate the full-store payload). Loads only the
 * pattern library document server-side.
 */
export async function GET() {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternLibraryDocLoaded();
    const store = await readPatternLibraryFresh();
    return NextResponse.json({
      base_patterns: store.base_patterns,
      dictionary: store.dictionary,
    });
  } catch (error) {
    console.error("Failed to list base patterns:", error);
    return NextResponse.json({ error: "Failed to list base patterns." }, { status: 500 });
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
    const result = await createBasePattern(body, { createdBy: session.email });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ base: result.base }, { status: 201 });
  } catch (error) {
    console.error("Failed to create base pattern:", error);
    return NextResponse.json({ error: "Failed to create base pattern." }, { status: 500 });
  }
}
