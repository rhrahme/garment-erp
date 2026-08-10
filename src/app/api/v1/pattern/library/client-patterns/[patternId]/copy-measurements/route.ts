import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import {
  ensurePatternLibraryLoaded,
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
    const store = await readPatternLibraryFresh();
    const source = store.client_patterns.find((pattern) => pattern.id === patternId);
    if (!source) {
      return NextResponse.json({ error: "Client pattern not found." }, { status: 404 });
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
