import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { ensurePatternLibraryLoaded } from "@/lib/data/pattern-library";
import { applyTudSizeFill } from "@/lib/pattern-library/mutations";

/**
 * API-key twin of the .tud size-fill action (Zapier parity): set the pattern's
 * base size from a detected .tud size and pre-fill empty measurement cells.
 * Body: { size, base_pattern_id?, version_id?, applied_by? }
 */
export async function POST(request: Request, context: { params: Promise<{ patternId: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
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
      { appliedBy: typeof body.applied_by === "string" ? body.applied_by : "api" }
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
      source: "api",
    });
  } catch (error) {
    console.error("Failed to apply .tud size fill (API):", error);
    return NextResponse.json({ error: "Failed to apply .tud size fill." }, { status: 500 });
  }
}
