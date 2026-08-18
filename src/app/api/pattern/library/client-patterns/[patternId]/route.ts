import { after, NextResponse } from "next/server";
import { requirePatternAccess, sessionActor } from "@/lib/auth/session";
import { getClientById } from "@/lib/data/clients";
import { readFabricReceipts } from "@/lib/data/fabric-receipts";
import {
  ensurePatternLibraryLoaded,
  readPatternLibraryCached,
} from "@/lib/data/pattern-library";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readPatternJobs } from "@/lib/data/pattern-jobs";
import { readSalesOrders } from "@/lib/data/sales-orders";
import { formatBasePatternDisplayName } from "@/lib/pattern-library/derived-from";
import { linkedFabricRowsForPattern } from "@/lib/pattern-library/linked-fabric-rows-for-pattern";
import { resolveMarkerFabricWidthAsync } from "@/lib/pattern-library/marker-layout-server";
import { hydrateMultiPieceGeometry } from "@/lib/pattern-library/multi-piece-geometry";
import { healEmptyClientPatternMeasurements } from "@/lib/pattern-library/heal-empty-measurements";
import { healMislabeledInchClientPatternUnit } from "@/lib/pattern-library/heal-measurement-unit";
import {
  assignFabricLinesToClientPattern,
  seedMarkerLayoutIfMissing,
  updateClientPattern,
  updateClientPatternTrialSheet,
} from "@/lib/pattern-library/mutations";

/**
 * Open sheet GET: one warm-cache library read, no blocking heal/seed writes.
 * Heals run in after() so first paint is not waiting on multi-MB RMW.
 */
export async function GET(_request: Request, context: { params: Promise<{ patternId: string }> }) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternLibraryLoaded();
    await ensureDocumentsLoaded(["pattern_jobs", "sales_orders", "fabric_receipts"]);
    const { patternId } = await context.params;

    const library = await readPatternLibraryCached();
    const pattern =
      library.client_patterns.find((candidate) => candidate.id === patternId) ?? null;
    if (!pattern) {
      return NextResponse.json({ error: "Client pattern not found." }, { status: 404 });
    }

    // Background: seed marker + heal empty / unit - never blocks the sheet open.
    after(async () => {
      try {
        await seedMarkerLayoutIfMissing(patternId, { notify: false });
        await healEmptyClientPatternMeasurements(patternId);
        await healMislabeledInchClientPatternUnit(patternId);
        const jobLineIds = readPatternJobs()
          .jobs.filter((job) => job.client_pattern_id === patternId)
          .map((job) => job.sales_order_line_id?.trim())
          .filter((id): id is string => Boolean(id));
        const linked = new Set(pattern.linked_fabric_line_ids ?? []);
        const missing = jobLineIds.filter((id) => !linked.has(id));
        if (missing.length > 0) {
          await assignFabricLinesToClientPattern(patternId, missing, { notify: false });
        }
      } catch (error) {
        console.error("Background client-pattern heal failed:", patternId, error);
      }
    });

    const hydration = hydrateMultiPieceGeometry(pattern, library.client_patterns);
    const viewPattern = hydration.pattern;
    const linkedBase = viewPattern.base_pattern_id
      ? library.base_patterns.find((candidate) => candidate.id === viewPattern.base_pattern_id) ?? null
      : null;
    const linkedJobs = readPatternJobs()
      .jobs.filter((job) => job.client_pattern_id === patternId)
      .map((job) => ({
        id: job.id,
        so_number: job.so_number,
        garment_type: job.garment_type,
        status: job.status,
        client_pattern_id: job.client_pattern_id ?? null,
        client_pattern_version_id: job.client_pattern_version_id ?? null,
        width_cm: job.width_cm ?? null,
        fabric_number: job.fabric_number ?? null,
        sales_order_line_id: job.sales_order_line_id ?? null,
      }));
    const jobWidthHint =
      linkedJobs.find((job) => typeof job.width_cm === "number" && job.width_cm > 0)?.width_cm ??
      null;
    const widthSuggestion = await resolveMarkerFabricWidthAsync(viewPattern, {
      hints: [jobWidthHint],
    });

    const client = getClientById(viewPattern.client_id);
    const clientName = client
      ? [client.first_name, client.middle_name, client.last_name].filter(Boolean).join(" ")
      : viewPattern.client_name;
    const linkedFabricRows = linkedFabricRowsForPattern({
      pattern: viewPattern,
      clientCode: client?.code ?? viewPattern.client_code,
      clientName,
      orders: readSalesOrders().orders,
      receipts: readFabricReceipts().receipts,
      jobs: linkedJobs,
    });

    return NextResponse.json({
      pattern: viewPattern,
      geometry_borrowed: hydration.borrowed,
      geometry_borrowed_from: hydration.borrowed_from,
      linked_jobs: linkedJobs,
      linked_fabric_rows: linkedFabricRows,
      suggested_fabric_width_cm: widthSuggestion?.width_cm ?? null,
      suggested_fabric_width_source: widthSuggestion?.source ?? null,
      marker_backfilled: false,
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

    // Atomic Sample / Trials / Final sheet save (all trials, one document write).
    if (Array.isArray(body?.trial_sheet_versions)) {
      const result = await updateClientPatternTrialSheet(
        patternId,
        body.trial_sheet_versions,
        { updatedBy: sessionActor(session) }
      );
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ pattern: result.pattern });
    }

    const result = await updateClientPattern(patternId, body, { updatedBy: sessionActor(session) });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ pattern: result.pattern });
  } catch (error) {
    console.error("Failed to update client pattern:", error);
    return NextResponse.json({ error: "Failed to update client pattern." }, { status: 500 });
  }
}
