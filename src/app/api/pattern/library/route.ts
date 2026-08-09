import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import {
  ensurePatternLibraryLoaded,
  readPatternLibraryCached,
} from "@/lib/data/pattern-library";
import { slimClientPatternForList } from "@/lib/pattern-library/client-pattern-list";

/**
 * Pattern library index for the workspace list UI.
 * Warm-cache read; client_patterns are slimmed (empty measurement grids).
 * Writes still use force-fresh RMW elsewhere.
 */
export async function GET() {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternLibraryLoaded();
    const store = await readPatternLibraryCached();
    return NextResponse.json({
      updated_at: store.updated_at,
      dictionary: store.dictionary,
      base_patterns: store.base_patterns,
      client_patterns: store.client_patterns.map(slimClientPatternForList),
    });
  } catch (error) {
    console.error("Failed to load pattern library:", error);
    return NextResponse.json({ error: "Failed to load pattern library." }, { status: 500 });
  }
}
