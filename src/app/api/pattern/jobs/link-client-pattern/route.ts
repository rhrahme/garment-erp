import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import { ensurePatternDocumentsLoaded } from "@/lib/data/pattern-jobs";
import { linkPatternJobsToClientPattern } from "@/lib/pattern/mutations";

/**
 * Batch-link drafting jobs to one client pattern (one jobs write).
 * Body: { job_ids: string[], client_pattern_id: string }
 */
export async function POST(request: Request) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternDocumentsLoaded();
    const body = (await request.json()) as {
      job_ids?: string[];
      client_pattern_id?: string;
    };
    const result = await linkPatternJobsToClientPattern(
      Array.isArray(body.job_ids) ? body.job_ids : [],
      body.client_pattern_id ?? "",
      { updatedBy: session.email }
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      jobs: result.jobs,
      linked_count: result.linked_count,
    });
  } catch (error) {
    console.error("Failed to batch-link pattern jobs:", error);
    return NextResponse.json({ error: "Failed to link pattern jobs." }, { status: 500 });
  }
}
