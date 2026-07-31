import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import {
  ensurePatternLibraryLoaded,
  readPatternLibraryFresh,
} from "@/lib/data/pattern-library";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readPatternJobs } from "@/lib/data/pattern-jobs";
import { formatBasePatternDisplayName } from "@/lib/pattern-library/derived-from";
import { resolveMarkerFabricWidthAsync } from "@/lib/pattern-library/marker-layout";
import {
  seedMarkerLayoutIfMissing,
  updateClientPattern,
} from "@/lib/pattern-library/mutations";

export async function GET(_request: Request, context: { params: Promise<{ patternId: string }> }) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternLibraryLoaded();
    await ensureDocumentsLoaded(["pattern_jobs", "sales_orders"]);
    const { patternId } = await context.params;

    // Existing TUDs: fill width/marker layout on open (no re-upload).
    const seeded = await seedMarkerLayoutIfMissing(patternId, { notify: false });
    const pattern = seeded.ok
      ? seeded.pattern
      : (await readPatternLibraryFresh()).client_patterns.find(
          (candidate) => candidate.id === patternId
        ) ?? null;
    if (!pattern) {
      return NextResponse.json({ error: "Client pattern not found." }, { status: 404 });
    }

    const library = await readPatternLibraryFresh();
    const linkedBase = pattern.base_pattern_id
      ? library.base_patterns.find((candidate) => candidate.id === pattern.base_pattern_id) ?? null
      : null;
    const linkedJobs = readPatternJobs()
      .jobs.filter((job) => job.client_pattern_id === patternId)
      .map((job) => ({
        id: job.id,
        so_number: job.so_number,
        garment_type: job.garment_type,
        status: job.status,
        client_pattern_version_id: job.client_pattern_version_id ?? null,
        width_cm: job.width_cm ?? null,
      }));
    const jobWidthHint =
      linkedJobs.find((job) => typeof job.width_cm === "number" && job.width_cm > 0)?.width_cm ??
      null;
    const widthSuggestion = await resolveMarkerFabricWidthAsync(pattern, {
      hints: [jobWidthHint],
    });
    return NextResponse.json({
      pattern,
      linked_jobs: linkedJobs,
      suggested_fabric_width_cm: widthSuggestion?.width_cm ?? null,
      suggested_fabric_width_source: widthSuggestion?.source ?? null,
      marker_backfilled: seeded.ok ? seeded.changed : false,
      base: linkedBase
        ? {
            id: linkedBase.id,
            name: linkedBase.name,
            display_name: formatBasePatternDisplayName(linkedBase),
            house_brand_code: linkedBase.house_brand_code,
            cut_family: linkedBase.cut_family,
            garment_type: linkedBase.garment_type,
            cut_variant: linkedBase.cut_variant,
          }
        : null,
    });
  } catch (error) {
    console.error("Failed to load client pattern:", error);
    return NextResponse.json({ error: "Failed to load client pattern." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ patternId: string }> }) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternLibraryLoaded();
    const { patternId } = await context.params;
    const body = await request.json();
    const result = await updateClientPattern(patternId, body, { updatedBy: session.email });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ pattern: result.pattern });
  } catch (error) {
    console.error("Failed to update client pattern:", error);
    return NextResponse.json({ error: "Failed to update client pattern." }, { status: 500 });
  }
}
