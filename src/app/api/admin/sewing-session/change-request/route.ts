import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  listPendingSewingSessionChangeRequests,
  readSewingSessionChangeRequestsFresh,
} from "@/lib/data/sewing-session-change-requests";
import {
  decideSewingSessionChangeRequest,
  summarizeSewingSessionChangeRequest,
} from "@/lib/production/sewing-session-change-requests";

export async function GET() {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }
    await ensureDocumentsLoaded(["sewing_session_change_requests"]);
    const store = await readSewingSessionChangeRequestsFresh();
    const pending = listPendingSewingSessionChangeRequests(store).map(
      summarizeSewingSessionChangeRequest
    );
    return NextResponse.json({
      requests: pending,
      all: store.requests.slice(0, 100).map(summarizeSewingSessionChangeRequest),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load change requests.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      action?: string;
      request_id?: string;
      decision_note?: string | null;
    } | null;

    const requestId = body?.request_id?.trim();
    if (!requestId) {
      return NextResponse.json({ error: "request_id is required." }, { status: 400 });
    }

    const decision =
      body?.action === "approve" ? "approve" : body?.action === "reject" ? "reject" : null;
    if (!decision) {
      return NextResponse.json(
        { error: "action must be approve or reject." },
        { status: 400 }
      );
    }

    const result = await decideSewingSessionChangeRequest(
      requestId,
      decision,
      (session.email ?? session.userId ?? "admin").trim() || "admin",
      { decision_note: body?.decision_note, source: "erp" }
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      request: summarizeSewingSessionChangeRequest(result.request),
      detail: result.detail ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to decide change request.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
