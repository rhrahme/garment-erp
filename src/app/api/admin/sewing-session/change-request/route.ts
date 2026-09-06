import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  listPendingSewingSessionChangeRequests,
  readSewingSessionChangeRequestsFresh,
} from "@/lib/data/sewing-session-change-requests";
import { collectSewingSessionChangeRequestIds } from "@/lib/production/sewing-session-change-request-ids";
import {
  decideSewingSessionChangeRequests,
  summarizeSewingSessionChangeRequest,
} from "@/lib/production/sewing-session-change-requests";

export async function GET() {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }
    await ensureDocumentsLoaded(["sewing_session_change_requests", "payroll_employees"]);
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
      request_ids?: unknown;
      decision_note?: string | null;
    } | null;

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

    const decision =
      body?.action === "approve" ? "approve" : body?.action === "reject" ? "reject" : null;
    if (!decision) {
      return NextResponse.json(
        { error: "action must be approve or reject." },
        { status: 400 }
      );
    }

    const results = await decideSewingSessionChangeRequests(
      requestIds,
      decision,
      (session.email ?? session.userId ?? "admin").trim() || "admin",
      { decision_note: body?.decision_note, source: "erp" }
    );
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to decide change request.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
