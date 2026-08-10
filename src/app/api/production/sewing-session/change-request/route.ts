import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  listPendingSewingSessionChangeRequests,
  readSewingSessionChangeRequestsFresh,
} from "@/lib/data/sewing-session-change-requests";
import {
  cancelSewingSessionChangeRequest,
  createSewingSessionChangeRequest,
  summarizeSewingSessionChangeRequest,
} from "@/lib/production/sewing-session-change-requests";
import type {
  SewingSessionChangeAction,
  SewingSessionEditPatch,
} from "@/lib/types/sewing-session-change-requests";

function canRequest(session: NonNullable<Awaited<ReturnType<typeof requireAuthenticated>>>): boolean {
  return (
    session.isAdmin ||
    session.isStitchOperator ||
    session.isPatternOperator ||
    session.isProductionOperator
  );
}

export async function GET() {
  try {
    const session = await requireAuthenticated();
    if (!session || !canRequest(session)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    await ensureDocumentsLoaded(["sewing_session_change_requests"]);
    const store = await readSewingSessionChangeRequestsFresh();
    const pending = listPendingSewingSessionChangeRequests(store).map(
      summarizeSewingSessionChangeRequest
    );
    return NextResponse.json({ requests: pending });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load change requests.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticated();
    if (!session || !canRequest(session)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      action?: string;
      request_action?: SewingSessionChangeAction;
      session_id?: string | null;
      failure_id?: string | null;
      proposed_patch?: SewingSessionEditPatch | null;
      reason?: string | null;
      request_id?: string | null;
    } | null;

    const actor = (session.email ?? session.userId ?? "unknown").trim() || "unknown";
    const verb = body?.action?.trim();

    if (verb === "cancel") {
      const requestId = body?.request_id?.trim();
      if (!requestId) {
        return NextResponse.json({ error: "request_id is required." }, { status: 400 });
      }
      const store = await readSewingSessionChangeRequestsFresh();
      const existing = store.requests.find((row) => row.id === requestId);
      if (!existing) {
        return NextResponse.json({ error: "Change request not found." }, { status: 404 });
      }
      if (!session.isAdmin && existing.requested_by !== actor) {
        return NextResponse.json(
          { error: "Only the requester or an admin can cancel this request." },
          { status: 403 }
        );
      }
      const result = await cancelSewingSessionChangeRequest(requestId, actor, "erp");
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({
        request: summarizeSewingSessionChangeRequest(result.request),
      });
    }

    if (verb !== "request") {
      return NextResponse.json(
        { error: "action must be request or cancel." },
        { status: 400 }
      );
    }

    const requestAction = body?.request_action;
    if (
      requestAction !== "delete" &&
      requestAction !== "stop" &&
      requestAction !== "edit" &&
      requestAction !== "pause_kiosk" &&
      requestAction !== "delete_failure"
    ) {
      return NextResponse.json({ error: "Invalid request_action." }, { status: 400 });
    }

    const result = await createSewingSessionChangeRequest(
      {
        action: requestAction,
        session_id: body?.session_id,
        failure_id: body?.failure_id,
        proposed_patch: body?.proposed_patch ?? null,
        reason: body?.reason,
        requested_by: actor,
      },
      "erp"
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      request: summarizeSewingSessionChangeRequest(result.request),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit change request.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
