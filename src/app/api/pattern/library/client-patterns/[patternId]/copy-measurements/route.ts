import { NextResponse } from "next/server";
import { requirePatternAccess, sessionActor } from "@/lib/auth/session";
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

/** List same-client + same-garment consolidation sheets that can receive sizes. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ patternId: string }> }
) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternLibraryLoaded();
    const { patternId } = await context.params;
    // Warm-cache read first; a degraded Supabase must not turn into a bogus
    // "not found" (forced reads return an EMPTY store on failure).
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
            ? "Sheets are still loading. Press Refresh list and try again."
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
    });
  } catch (error) {
    console.error("Failed to list copy-measurement siblings:", error);
    return NextResponse.json({ error: "Failed to list target sheets." }, { status: 500 });
  }
}

/**
 * Copy this sheet's sizes onto selected sibling consolidations.
 * Body: {
 *   target_pattern_ids: string[],
 *   mode?: "overwrite" | "fill_empty_only",
 *   piece_scope?: "all" | piece name (Overshirt / Trouser / ...)
 * }
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ patternId: string }> }
) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternLibraryLoaded();
    const { patternId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      target_pattern_ids?: unknown;
      mode?: string | null;
      piece_scope?: string | null;
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
      { actedBy: sessionActor(session) }
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to copy measurements to siblings:", error);
    return NextResponse.json({ error: "Failed to copy measurements." }, { status: 500 });
  }
}
