import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import { ensurePatternDocumentsLoaded } from "@/lib/data/pattern-jobs";
import { getPatternJobById } from "@/lib/data/pattern-jobs";
import {
  isValidPatternJobStatus,
  updatePatternJob,
} from "@/lib/pattern/mutations";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }

    await ensurePatternDocumentsLoaded();
    const { id } = await context.params;
    const job = getPatternJobById(id);
    if (!job) {
      return NextResponse.json({ error: "Pattern job not found." }, { status: 404 });
    }

    return NextResponse.json({ job });
  } catch (error) {
    console.error("Failed to read pattern job:", error);
    return NextResponse.json({ error: "Failed to load pattern job." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }

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
    };

    if (body.status != null && !isValidPatternJobStatus(body.status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }

    const patch: Parameters<typeof updatePatternJob>[1] = {};
    if (body.status != null) patch.status = body.status;
    if ("assigned_to" in body) patch.assigned_to = body.assigned_to;
    if ("pattern_code" in body) patch.pattern_code = body.pattern_code;
    if ("pattern_size_notes" in body) patch.pattern_size_notes = body.pattern_size_notes;
    if (body.trial_priority != null) patch.trial_priority = body.trial_priority;
    if ("blocked_reason" in body) patch.blocked_reason = body.blocked_reason;
    if ("notes" in body) patch.notes = body.notes;

    const result = await updatePatternJob(id, patch, { updatedBy: session.email });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ job: result.job });
  } catch (error) {
    console.error("Failed to update pattern job:", error);
    return NextResponse.json({ error: "Failed to update pattern job." }, { status: 500 });
  }
}
