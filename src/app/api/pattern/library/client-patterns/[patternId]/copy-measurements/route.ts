import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import {
  ensurePatternLibraryLoaded,
  readPatternLibraryFresh,
} from "@/lib/data/pattern-library";
import { listCopyMeasurementSiblings } from "@/lib/pattern-library/copy-measurements-to-siblings";
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
    const store = await readPatternLibraryFresh();
    const source = store.client_patterns.find((pattern) => pattern.id === patternId);
    if (!source) {
      return NextResponse.json({ error: "Client pattern not found." }, { status: 404 });
    }
    return NextResponse.json({
      source_pattern_id: source.id,
      siblings: listCopyMeasurementSiblings(store.client_patterns, source),
    });
  } catch (error) {
    console.error("Failed to list copy-measurement siblings:", error);
    return NextResponse.json({ error: "Failed to list target sheets." }, { status: 500 });
  }
}

/**
 * Copy this sheet's sizes onto selected sibling consolidations.
 * Body: { target_pattern_ids: string[], mode?: "overwrite" | "fill_empty_only" }
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
    };
    const targetIds = Array.isArray(body.target_pattern_ids)
      ? body.target_pattern_ids.filter((id): id is string => typeof id === "string")
      : [];
    const result = await copyClientPatternMeasurementsToSiblings(
      patternId,
      {
        target_pattern_ids: targetIds,
        mode: body.mode === "fill_empty_only" ? "fill_empty_only" : "overwrite",
      },
      { actedBy: session.email }
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
