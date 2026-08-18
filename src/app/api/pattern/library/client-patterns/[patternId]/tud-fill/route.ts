import { NextResponse } from "next/server";
import { requirePatternAccess, sessionActor } from "@/lib/auth/session";
import { ensurePatternLibraryLoaded } from "@/lib/data/pattern-library";
import { applyTudSizeFill } from "@/lib/pattern-library/mutations";

/**
 * Apply a size detected in an uploaded .tud: sets the pattern's base size
 * (linking a base first via base_pattern_id when the pattern has none) and
 * pre-fills empty measurement cells from the base values at that size.
 * Body: { size, base_pattern_id?, version_id? }
 */
export async function POST(request: Request, context: { params: Promise<{ patternId: string }> }) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternLibraryLoaded();
    const { patternId } = await context.params;
    const body = await request.json();
    const result = await applyTudSizeFill(
      patternId,
      {
        size: typeof body.size === "string" ? body.size : null,
        base_pattern_id: typeof body.base_pattern_id === "string" ? body.base_pattern_id : null,
        version_id: typeof body.version_id === "string" ? body.version_id : null,
      },
      { appliedBy: sessionActor(session) }
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      pattern: result.pattern,
      version_id: result.version.id,
      base_size: result.base_size,
      filled_points: result.filled_points,
      added_points: result.added_points,
    });
  } catch (error) {
    console.error("Failed to apply .tud size fill:", error);
    return NextResponse.json({ error: "Failed to apply .tud size fill." }, { status: 500 });
  }
}
