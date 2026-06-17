import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { ensurePatternDocumentsLoaded } from "@/lib/data/pattern-jobs";
import { getPatternJobById } from "@/lib/data/pattern-jobs";
import { isValidPatternJobStatus, updatePatternJob } from "@/lib/pattern/mutations";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternDocumentsLoaded();
    const { id } = await context.params;
    const job = getPatternJobById(id);
    if (!job) {
      return NextResponse.json({ error: "Pattern job not found." }, { status: 404 });
    }
    return NextResponse.json({ job });
  } catch (error) {
    console.error("Failed to read pattern job (API):", error);
    return NextResponse.json({ error: "Failed to load pattern job." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternDocumentsLoaded();
    const { id } = await context.params;
    const body = (await request.json()) as {
      status?: string;
      assigned_to?: string | null;
      pattern_code?: string | null;
      pattern_size_notes?: string | null;
      trial_priority?: boolean;
      blocked_reason?: string | null;
      notes?: string | null;
      updated_by?: string;
    };

    if (body.status != null && !isValidPatternJobStatus(body.status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }

    const result = await updatePatternJob(
      id,
      {
        status: body.status,
        assigned_to: body.assigned_to,
        pattern_code: body.pattern_code,
        pattern_size_notes: body.pattern_size_notes,
        trial_priority: body.trial_priority,
        blocked_reason: body.blocked_reason,
        notes: body.notes,
      },
      { updatedBy: body.updated_by?.trim() || "api" }
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ job: result.job, source: "api" });
  } catch (error) {
    console.error("Failed to update pattern job (API):", error);
    return NextResponse.json({ error: "Failed to update pattern job." }, { status: 500 });
  }
}
