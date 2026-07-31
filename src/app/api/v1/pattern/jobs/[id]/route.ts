import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { ensurePatternDocumentsLoaded } from "@/lib/data/pattern-jobs";
import {
  ensurePatternJobTudCode,
  isValidPatternJobStatus,
  updatePatternJob,
} from "@/lib/pattern/mutations";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternDocumentsLoaded();
    const { id } = await context.params;
    const ensured = await ensurePatternJobTudCode(id);
    if (!ensured.ok) {
      return NextResponse.json({ error: ensured.error }, { status: ensured.status });
    }
    return NextResponse.json({ job: ensured.job });
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
      client_pattern_id?: string | null;
      client_pattern_version_id?: string | null;
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
        client_pattern_id: body.client_pattern_id,
        client_pattern_version_id: body.client_pattern_version_id,
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
