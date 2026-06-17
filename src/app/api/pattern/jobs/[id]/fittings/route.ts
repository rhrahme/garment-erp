import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import { ensurePatternDocumentsLoaded } from "@/lib/data/pattern-jobs";
import { addPatternFitting, completePatternFitting } from "@/lib/pattern/mutations";
import { isValidFittingOutcome } from "@/lib/pattern/mutations";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }

    await ensurePatternDocumentsLoaded();
    const { id } = await context.params;
    const body = (await request.json()) as {
      action?: "schedule" | "complete";
      fitting_id?: string;
      scheduled_at?: string | null;
      notes?: string | null;
      attendees?: string[];
      outcome?: string;
      completed_at?: string;
    };

    if (body.action === "complete") {
      const fittingId = body.fitting_id?.trim() ?? "";
      const outcome = body.outcome?.trim() ?? "";
      if (!fittingId || !outcome) {
        return NextResponse.json({ error: "fitting_id and outcome are required." }, { status: 400 });
      }
      if (!isValidFittingOutcome(outcome)) {
        return NextResponse.json({ error: "Invalid fitting outcome." }, { status: 400 });
      }

      const result = await completePatternFitting(id, fittingId, {
        outcome,
        notes: body.notes,
        attendees: body.attendees,
        completed_at: body.completed_at,
      }, { completedBy: session.email });

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      return NextResponse.json({ job: result.job, fitting: result.fitting });
    }

    const result = await addPatternFitting(id, {
      scheduled_at: body.scheduled_at,
      notes: body.notes,
      attendees: body.attendees,
    }, { createdBy: session.email });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ job: result.job, fitting: result.fitting }, { status: 201 });
  } catch (error) {
    console.error("Failed to manage pattern fitting:", error);
    return NextResponse.json({ error: "Failed to manage fitting." }, { status: 500 });
  }
}
