import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import {
  ensurePatternLibraryLoaded,
  getClientPatternByIdFresh,
} from "@/lib/data/pattern-library";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readPatternJobs } from "@/lib/data/pattern-jobs";
import { updateClientPattern } from "@/lib/pattern-library/mutations";

export async function GET(_request: Request, context: { params: Promise<{ patternId: string }> }) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternLibraryLoaded();
    await ensureDocumentsLoaded(["pattern_jobs"]);
    const { patternId } = await context.params;
    const pattern = await getClientPatternByIdFresh(patternId);
    if (!pattern) {
      return NextResponse.json({ error: "Client pattern not found." }, { status: 404 });
    }
    const linkedJobs = readPatternJobs()
      .jobs.filter((job) => job.client_pattern_id === patternId)
      .map((job) => ({
        id: job.id,
        so_number: job.so_number,
        garment_type: job.garment_type,
        status: job.status,
        client_pattern_version_id: job.client_pattern_version_id ?? null,
      }));
    return NextResponse.json({ pattern, linked_jobs: linkedJobs });
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
