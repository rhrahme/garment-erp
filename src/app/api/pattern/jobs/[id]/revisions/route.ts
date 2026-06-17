import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import { ensurePatternDocumentsLoaded } from "@/lib/data/pattern-jobs";
import { addPatternRevision } from "@/lib/pattern/mutations";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }

    await ensurePatternDocumentsLoaded();
    const { id } = await context.params;
    const body = (await request.json()) as {
      changes_summary?: string | null;
      triggered_by_fitting_id?: string | null;
    };

    const result = await addPatternRevision(id, {
      changes_summary: body.changes_summary,
      triggered_by_fitting_id: body.triggered_by_fitting_id,
      revised_by: session.email,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ job: result.job, revision: result.revision }, { status: 201 });
  } catch (error) {
    console.error("Failed to add pattern revision:", error);
    return NextResponse.json({ error: "Failed to add revision." }, { status: 500 });
  }
}
