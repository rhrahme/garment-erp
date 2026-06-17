import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { ensurePatternDocumentsLoaded } from "@/lib/data/pattern-jobs";
import { addPatternFitting, completePatternFitting, isValidFittingOutcome } from "@/lib/pattern/mutations";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
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
      created_by?: string;
      completed_by?: string;
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
      }, { completedBy: body.completed_by?.trim() || "api" });

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      return NextResponse.json({ job: result.job, fitting: result.fitting, source: "api" });
    }

    const result = await addPatternFitting(id, {
      scheduled_at: body.scheduled_at,
      notes: body.notes,
      attendees: body.attendees,
    }, { createdBy: body.created_by?.trim() || "api" });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ job: result.job, fitting: result.fitting, source: "api" }, { status: 201 });
  } catch (error) {
    console.error("Failed to manage pattern fitting (API):", error);
    return NextResponse.json({ error: "Failed to manage fitting." }, { status: 500 });
  }
}
