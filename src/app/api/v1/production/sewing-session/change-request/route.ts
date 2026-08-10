import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  listPendingSewingSessionChangeRequests,
  readSewingSessionChangeRequestsFresh,
} from "@/lib/data/sewing-session-change-requests";
import { verifyApiKey } from "@/lib/integrations";
import {
  cancelSewingSessionChangeRequest,
  createSewingSessionChangeRequest,
  decideSewingSessionChangeRequest,
  summarizeSewingSessionChangeRequest,
} from "@/lib/production/sewing-session-change-requests";
import type {
  SewingSessionChangeAction,
  SewingSessionEditPatch,
} from "@/lib/types/sewing-session-change-requests";

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  try {
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
  const authError = verifyApiKey(request);
  if (authError) return authError;
  try {
    const body = (await request.json().catch(() => null)) as {
      action?: string;
      request_action?: SewingSessionChangeAction;
      session_id?: string | null;
      failure_id?: string | null;
      proposed_patch?: SewingSessionEditPatch | null;
      reason?: string | null;
      request_id?: string | null;
      actor?: string | null;
      decision_note?: string | null;
    } | null;

    const actor =
      typeof body?.actor === "string" && body.actor.trim() ? body.actor.trim() : "api";
    const verb = body?.action?.trim();

    if (verb === "cancel") {
      const requestId = body?.request_id?.trim();
      if (!requestId) {
        return NextResponse.json({ error: "request_id is required." }, { status: 400 });
      }
      const result = await cancelSewingSessionChangeRequest(requestId, actor, "api");
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({
        request: summarizeSewingSessionChangeRequest(result.request),
      });
    }

    if (verb === "approve" || verb === "reject") {
      const requestId = body?.request_id?.trim();
      if (!requestId) {
        return NextResponse.json({ error: "request_id is required." }, { status: 400 });
      }
      const result = await decideSewingSessionChangeRequest(requestId, verb, actor, {
        decision_note: body?.decision_note,
        source: "api",
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({
        request: summarizeSewingSessionChangeRequest(result.request),
        detail: result.detail ?? null,
      });
    }

    if (verb !== "request") {
      return NextResponse.json(
        { error: "action must be request, cancel, approve, or reject." },
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
      "api"
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      request: summarizeSewingSessionChangeRequest(result.request),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process change request.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
