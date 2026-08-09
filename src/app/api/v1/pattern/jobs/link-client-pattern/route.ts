import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { ensurePatternDocumentsLoaded } from "@/lib/data/pattern-jobs";
import { linkPatternJobsToClientPattern } from "@/lib/pattern/mutations";

/**
 * Zapier/API: batch-link drafting jobs to one client pattern.
 * Body: { job_ids: string[], client_pattern_id: string, updated_by?: string }
 */
export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternDocumentsLoaded();
    const body = (await request.json()) as {
      job_ids?: string[];
      client_pattern_id?: string;
      updated_by?: string;
    };
    const result = await linkPatternJobsToClientPattern(
      Array.isArray(body.job_ids) ? body.job_ids : [],
      body.client_pattern_id ?? "",
      { updatedBy: body.updated_by?.trim() || "api" }
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      jobs: result.jobs,
      linked_count: result.linked_count,
      source: "api",
    });
  } catch (error) {
    console.error("Failed to batch-link pattern jobs (API):", error);
    return NextResponse.json({ error: "Failed to link pattern jobs." }, { status: 500 });
  }
}
