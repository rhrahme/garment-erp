import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { ensurePatternDocumentsLoaded } from "@/lib/data/pattern-jobs";
import { addPatternRevision } from "@/lib/pattern/mutations";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternDocumentsLoaded();
    const { id } = await context.params;
    const body = (await request.json()) as {
      changes_summary?: string | null;
      triggered_by_fitting_id?: string | null;
      revised_by?: string;
    };

    const result = await addPatternRevision(id, {
      changes_summary: body.changes_summary,
      triggered_by_fitting_id: body.triggered_by_fitting_id,
      revised_by: body.revised_by?.trim() || "api",
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ job: result.job, revision: result.revision, source: "api" }, { status: 201 });
  } catch (error) {
    console.error("Failed to add pattern revision (API):", error);
    return NextResponse.json({ error: "Failed to add revision." }, { status: 500 });
  }
}
