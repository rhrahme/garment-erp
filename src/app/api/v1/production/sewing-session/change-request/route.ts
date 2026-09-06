import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  listPendingSewingSessionChangeRequests,
  readSewingSessionChangeRequestsFresh,
} from "@/lib/data/sewing-session-change-requests";
import { verifyApiKey } from "@/lib/integrations";
import { collectSewingSessionChangeRequestIds } from "@/lib/production/sewing-session-change-request-ids";
import {
  cancelSewingSessionChangeRequest,
  createSewingSessionChangeRequest,
  decideSewingSessionChangeRequests,
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
    await ensureDocumentsLoaded(["sewing_session_change_requests", "payroll_employees"]);
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
      request_ids?: unknown;
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
      const requestIds = collectSewingSessionChangeRequestIds({
        request_id: body?.request_id,
        request_ids: body?.request_ids,
      });
      if (requestIds.length === 0) {
        return NextResponse.json({ error: "request_id is required." }, { status: 400 });
      }
      if (requestIds.length > 100) {
        return NextResponse.json({ error: "Too many requests in one call." }, { status: 400 });
      }
      const results = await decideSewingSessionChangeRequests(requestIds, verb, actor, {
        decision_note: body?.decision_note,
        source: "api",
      });
      const details = results
        .map((row) => row.detail)
        .filter((detail): detail is string => Boolean(detail));
      const firstOk = results.find((row) => row.ok && row.request);
      const firstFail = results.find((row) => !row.ok);
      if (requestIds.length === 1 && firstFail) {
        return NextResponse.json(
          { error: firstFail.error ?? "Failed to decide change request." },
          { status: firstFail.status ?? 400 }
        );
      }
      return NextResponse.json({
        request: firstOk?.request ?? null,
        detail: details[0] ?? null,
        details,
        results,
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
