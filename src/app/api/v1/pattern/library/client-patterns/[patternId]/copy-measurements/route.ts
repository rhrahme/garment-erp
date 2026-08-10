import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import {
  ensurePatternLibraryLoaded,
  readPatternLibraryCached,
  readPatternLibraryFresh,
} from "@/lib/data/pattern-library";
import {
  copyMeasurementPieceOptions,
  listCopyMeasurementSiblings,
} from "@/lib/pattern-library/copy-measurements-to-siblings";
import { copyClientPatternMeasurementsToSiblings } from "@/lib/pattern-library/mutations";

export async function GET(
  request: Request,
  context: { params: Promise<{ patternId: string }> }
) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternLibraryLoaded();
    const { patternId } = await context.params;
    // Warm-cache read first; degraded Supabase must not become a bogus 404.
    let store = await readPatternLibraryCached();
    let source = store.client_patterns.find((pattern) => pattern.id === patternId);
    if (!source) {
      store = await readPatternLibraryFresh();
      source = store.client_patterns.find((pattern) => pattern.id === patternId);
    }
    if (!source) {
      const degraded = store.client_patterns.length === 0;
      return NextResponse.json(
        {
          error: degraded
            ? "Sheets are still loading. Retry shortly."
            : "Client pattern not found.",
        },
        { status: degraded ? 503 : 404 }
      );
    }
    return NextResponse.json({
      source_pattern_id: source.id,
      garment_type: source.garment_type,
      piece_options: copyMeasurementPieceOptions(source.garment_type),
      siblings: listCopyMeasurementSiblings(store.client_patterns, source),
      source: "api",
    });
  } catch (error) {
    console.error("Failed to list copy-measurement siblings (API):", error);
    return NextResponse.json({ error: "Failed to list target sheets." }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ patternId: string }> }
) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternLibraryLoaded();
    const { patternId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      target_pattern_ids?: unknown;
      mode?: string | null;
      piece_scope?: string | null;
      acted_by?: string | null;
    };
    const targetIds = Array.isArray(body.target_pattern_ids)
      ? body.target_pattern_ids.filter((id): id is string => typeof id === "string")
      : [];
    const result = await copyClientPatternMeasurementsToSiblings(
      patternId,
      {
        target_pattern_ids: targetIds,
        mode: body.mode === "fill_empty_only" ? "fill_empty_only" : "overwrite",
        piece_scope: body.piece_scope,
      },
      { actedBy: typeof body.acted_by === "string" ? body.acted_by : "api" }
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ...result, source: "api" });
  } catch (error) {
    console.error("Failed to copy measurements to siblings (API):", error);
    return NextResponse.json({ error: "Failed to copy measurements." }, { status: 500 });
  }
}
