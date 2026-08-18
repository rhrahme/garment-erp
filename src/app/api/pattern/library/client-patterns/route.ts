import { NextResponse } from "next/server";
import { requirePatternAccess, sessionActor } from "@/lib/auth/session";
import {
  ensurePatternLibraryLoaded,
  readPatternLibraryCached,
} from "@/lib/data/pattern-library";
import {
  slimClientPatternForList,
  toClientPatternListSummary,
} from "@/lib/pattern-library/client-pattern-list";
import { createClientPattern } from "@/lib/pattern-library/mutations";

/**
 * List client patterns.
 * - ?client_id= filters to one client (order board).
 * - ?summary=1 returns tiny rows (no versions/files).
 * - default: slimmed patterns (empty measurement grids) from warm cache.
 */
export async function GET(request: Request) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternLibraryLoaded();
    const store = await readPatternLibraryCached();
    const url = new URL(request.url);
    const clientId = url.searchParams.get("client_id")?.trim() || null;
    const summary = url.searchParams.get("summary") === "1";

    let patterns = store.client_patterns;
    if (clientId) {
      patterns = patterns.filter((pattern) => pattern.client_id === clientId);
    }

    if (summary) {
      return NextResponse.json({
        client_patterns: patterns.map(toClientPatternListSummary),
      });
    }

    return NextResponse.json({
      client_patterns: patterns.map(slimClientPatternForList),
    });
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
    const result = await createClientPattern(body, { createdBy: sessionActor(session) });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ pattern: result.pattern }, { status: 201 });
  } catch (error) {
    console.error("Failed to create client pattern:", error);
    return NextResponse.json({ error: "Failed to create client pattern." }, { status: 500 });
  }
}
