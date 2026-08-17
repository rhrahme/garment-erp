import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  readSewingScanFailuresFresh,
  writeSewingScanFailures,
} from "@/lib/data/sewing-scan-failures";
import {
  readSewingSessionChangeRequestsFresh,
  writeSewingSessionChangeRequests,
} from "@/lib/data/sewing-session-change-requests";
import { readSewingSessionsFresh, writeSewingSessions } from "@/lib/data/sewing-sessions";
import { setStitchKioskPaused } from "@/lib/data/stitch-kiosk-settings";
import { findPayrollEmployeeById } from "@/lib/hr/payroll-lookup";
import { notifyIntegration } from "@/lib/integrations";
import { notifyAdminsOfSewingSessionChangeRequest } from "@/lib/integrations/sewing-session-change-request-alert";
import { notifyRequesterOfAdminDecision } from "@/lib/integrations/admin-decision-alert";
import { summarizeSewingSessionChangeRequest } from "@/lib/production/sewing-session-change-request-summary";
import type {
  SewingScanFailureChangeSnapshot,
  SewingSessionChangeAction,
  SewingSessionChangeRequest,
  SewingSessionChangeSnapshot,
  SewingSessionEditPatch,
} from "@/lib/types/sewing-session-change-requests";
import type { SewingScanFailure } from "@/lib/types/sewing-scan-failures";
import type { SewingSession } from "@/lib/types/sewing-sessions";

export { summarizeSewingSessionChangeRequest };

type ResultOk<T> = { ok: true } & T;
type ResultErr = { ok: false; status: number; error: string };
type Result<T> = ResultOk<T> | ResultErr;

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function snapshotSession(session: SewingSession): SewingSessionChangeSnapshot {
  return {
    id: session.id,
    status: session.status,
    employee_id: session.employee_id,
    employee_name: session.employee_name,
    employee_id_number: session.employee_id_number,
    production_code: session.production_code,
    scan_code: session.scan_code,
    piece_mark: session.piece_mark,
    fabric_number: session.fabric_number ?? null,
    garment_type: session.garment_type ?? null,
    client_name: session.client_name,
    so_number: session.so_number,
    started_at: session.started_at,
    ended_at: session.ended_at,
    duration_sec: session.duration_sec,
    work_kind: session.work_kind ?? null,
    activity_job_function: session.activity_job_function ?? null,
    kiosk_id: session.kiosk_id,
  };
}

function snapshotFailure(failure: SewingScanFailure): SewingScanFailureChangeSnapshot {
  return {
    id: failure.id,
    scanned_at: failure.scanned_at,
    raw_code: failure.raw_code,
    reason: failure.reason,
    reason_code: failure.reason_code,
    scan_kind: failure.scan_kind,
    employee_name: failure.employee_name,
    employee_id_number: failure.employee_id_number,
    related_production_code: failure.related_production_code,
    kiosk_id: failure.kiosk_id,
  };
}

function cleanPatch(patch: SewingSessionEditPatch | null | undefined): SewingSessionEditPatch | null {
  if (!patch || typeof patch !== "object") return null;
  const next: SewingSessionEditPatch = {};
  const assign = <K extends keyof SewingSessionEditPatch>(key: K, value: SewingSessionEditPatch[K]) => {
    if (value !== undefined) next[key] = value;
  };
  assign("employee_id_number", patch.employee_id_number);
  assign("production_code", patch.production_code);
  assign("scan_code", patch.scan_code);
  assign("piece_mark", patch.piece_mark);
  assign("fabric_number", patch.fabric_number);
  assign("garment_type", patch.garment_type);
  assign("client_name", patch.client_name);
  assign("started_at", patch.started_at);
  assign("ended_at", patch.ended_at);
  assign("work_kind", patch.work_kind);
  assign("activity_job_function", patch.activity_job_function);
  return Object.keys(next).length > 0 ? next : null;
}

function durationBetween(startedAt: string, endedAt: string | null): number | null {
  if (!endedAt) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 1000);
}

function applyEditPatch(session: SewingSession, patch: SewingSessionEditPatch): Result<{ session: SewingSession }> {
  const next: SewingSession = { ...session };
  if (patch.employee_id_number !== undefined && patch.employee_id_number !== null) {
    const trimmed = String(patch.employee_id_number).trim();
    if (!trimmed) {
      return { ok: false, status: 400, error: "employee_id_number cannot be empty." };
    }
    const employee = findPayrollEmployeeById(trimmed);
    if (!employee) {
      return { ok: false, status: 400, error: `Employee not found for ID ${trimmed}.` };
    }
    next.employee_id = employee.id;
    next.employee_name = employee.full_name;
    next.employee_id_number = employee.employee_id_number;
  }
  if (patch.production_code !== undefined && patch.production_code !== null) {
    const value = String(patch.production_code).trim();
    if (!value) return { ok: false, status: 400, error: "production_code cannot be empty." };
    next.production_code = value;
  }
  if (patch.scan_code !== undefined && patch.scan_code !== null) {
    const value = String(patch.scan_code).trim();
    if (!value) return { ok: false, status: 400, error: "scan_code cannot be empty." };
    next.scan_code = value;
  }
  if (patch.piece_mark !== undefined) next.piece_mark = patch.piece_mark?.trim() || null;
  if (patch.fabric_number !== undefined) next.fabric_number = patch.fabric_number?.trim() || null;
  if (patch.garment_type !== undefined) next.garment_type = patch.garment_type?.trim() || null;
  if (patch.client_name !== undefined) next.client_name = patch.client_name?.trim() || null;
  if (patch.started_at !== undefined && patch.started_at !== null) {
    const value = String(patch.started_at).trim();
    if (!Number.isFinite(Date.parse(value))) {
      return { ok: false, status: 400, error: "started_at must be a valid ISO datetime." };
    }
    next.started_at = value;
  }
  if (patch.ended_at !== undefined) {
    if (patch.ended_at === null || patch.ended_at === "") {
      next.ended_at = null;
    } else {
      const value = String(patch.ended_at).trim();
      if (!Number.isFinite(Date.parse(value))) {
        return { ok: false, status: 400, error: "ended_at must be a valid ISO datetime." };
      }
      next.ended_at = value;
    }
  }
  if (patch.work_kind !== undefined) next.work_kind = patch.work_kind;
  if (patch.activity_job_function !== undefined) {
    next.activity_job_function = patch.activity_job_function;
  }
  if (next.status === "closed") {
    next.duration_sec = durationBetween(next.started_at, next.ended_at);
  }
  return { ok: true, session: next };
}

async function persistRequestDecision(
  requestId: string,
  patch: Pick<
    SewingSessionChangeRequest,
    "status" | "decided_by" | "decided_at" | "decision_note"
  >
): Promise<SewingSessionChangeRequest | null> {
  const store = structuredClone(await readSewingSessionChangeRequestsFresh());
  const index = store.requests.findIndex((row) => row.id === requestId);
  if (index < 0) return null;
  const next = { ...store.requests[index]!, ...patch };
  store.requests[index] = next;
  await writeSewingSessionChangeRequests(store);
  return next;
}

export type CreateSewingSessionChangeRequestInput = {
  action: SewingSessionChangeAction;
  session_id?: string | null;
  failure_id?: string | null;
  proposed_patch?: SewingSessionEditPatch | null;
  reason?: string | null;
  requested_by: string;
};

export async function createSewingSessionChangeRequest(
  input: CreateSewingSessionChangeRequestInput,
  source: "erp" | "api" = "erp"
): Promise<Result<{ request: SewingSessionChangeRequest }>> {
  await ensureDocumentsLoaded([
    "sewing_session_change_requests",
    "sewing_sessions",
    "sewing_scan_failures",
    "stitch_kiosk_settings",
    "payroll_employees",
  ]);

  const action = input.action;
  const reason = input.reason?.trim() || null;
  const requestedBy = input.requested_by.trim();
  if (!requestedBy) {
    return { ok: false, status: 400, error: "requested_by is required." };
  }

  let sessionSnapshot: SewingSessionChangeSnapshot | null = null;
  let failureSnapshot: SewingScanFailureChangeSnapshot | null = null;
  let sessionId: string | null = null;
  let failureId: string | null = null;
  let proposedPatch: SewingSessionEditPatch | null = null;

  if (action === "pause_kiosk") {
    // no target row
  } else if (action === "delete_failure") {
    failureId = input.failure_id?.trim() || null;
    if (!failureId) {
      return { ok: false, status: 400, error: "failure_id is required for delete_failure." };
    }
    const failures = await readSewingScanFailuresFresh();
    const failure = failures.failures.find((row) => row.id === failureId);
    if (!failure) {
      return { ok: false, status: 404, error: "Failed scan not found." };
    }
    failureSnapshot = snapshotFailure(failure);
  } else {
    sessionId = input.session_id?.trim() || null;
    if (!sessionId) {
      return { ok: false, status: 400, error: "session_id is required for this action." };
    }
    const sessions = await readSewingSessionsFresh();
    const session = sessions.sessions.find((row) => row.id === sessionId);
    if (!session) {
      return { ok: false, status: 404, error: "Sewing session not found." };
    }
    if (action === "stop" && session.status !== "open" && session.status !== "closing") {
      return { ok: false, status: 400, error: "Stop is only allowed for open or closing sessions." };
    }
    if (action === "edit") {
      proposedPatch = cleanPatch(input.proposed_patch);
      if (!proposedPatch) {
        return { ok: false, status: 400, error: "proposed_patch is required for edit." };
      }
      const preview = applyEditPatch(session, proposedPatch);
      if (!preview.ok) return preview;
    }
    sessionSnapshot = snapshotSession(session);
  }

  const store = structuredClone(await readSewingSessionChangeRequestsFresh());
  const duplicate = store.requests.find((row) => {
    if (row.status !== "pending") return false;
    if (action === "pause_kiosk") return row.action === "pause_kiosk";
    if (action === "delete_failure") return row.failure_id === failureId;
    return row.session_id === sessionId;
  });
  if (duplicate) {
    return {
      ok: false,
      status: 409,
      error: "A pending change request already exists for this target.",
    };
  }

  const request: SewingSessionChangeRequest = {
    id: newId("sscr"),
    status: "pending",
    action,
    session_id: sessionId,
    failure_id: failureId,
    session_snapshot: sessionSnapshot,
    failure_snapshot: failureSnapshot,
    proposed_patch: proposedPatch,
    reason,
    requested_by: requestedBy,
    requested_at: new Date().toISOString(),
    decided_by: null,
    decided_at: null,
    decision_note: null,
  };

  store.requests.unshift(request);
  await writeSewingSessionChangeRequests(store);

  try {
    await notifyIntegration(
      "production.sewing_session_change_requested",
      {
        request_id: request.id,
        action: request.action,
        session_id: request.session_id,
        failure_id: request.failure_id,
        requested_by: request.requested_by,
        reason: request.reason,
        production_code: request.session_snapshot?.production_code ?? null,
        fabric_number: request.session_snapshot?.fabric_number ?? null,
      },
      source
    );
  } catch (error) {
    console.error("[sewing-session-change-request] notifyIntegration failed:", error);
  }

  try {
    await notifyAdminsOfSewingSessionChangeRequest(request);
  } catch (error) {
    console.error("[sewing-session-change-request] admin email failed:", error);
  }

  return { ok: true, request };
}

export async function cancelSewingSessionChangeRequest(
  requestId: string,
  actor: string,
  source: "erp" | "api" = "erp"
): Promise<Result<{ request: SewingSessionChangeRequest }>> {
  await ensureDocumentsLoaded(["sewing_session_change_requests"]);
  const store = structuredClone(await readSewingSessionChangeRequestsFresh());
  const index = store.requests.findIndex((row) => row.id === requestId.trim());
  if (index < 0) return { ok: false, status: 404, error: "Change request not found." };
  const current = store.requests[index]!;
  if (current.status !== "pending") {
    return { ok: false, status: 400, error: "Only pending requests can be cancelled." };
  }
  const next: SewingSessionChangeRequest = {
    ...current,
    status: "cancelled",
    decided_by: actor.trim() || "unknown",
    decided_at: new Date().toISOString(),
    decision_note: "Cancelled by requester.",
  };
  store.requests[index] = next;
  await writeSewingSessionChangeRequests(store);
  try {
    await notifyIntegration(
      "production.sewing_session_change_rejected",
      {
        request_id: next.id,
        action: next.action,
        session_id: next.session_id,
        failure_id: next.failure_id,
        decided_by: next.decided_by,
        decision: "cancelled",
      },
      source
    );
  } catch {
    /* non-fatal */
  }
  return { ok: true, request: next };
}

/**
 * Approved "stop" requests close the session at the moment the floor ASKED
 * to stop, not when the admin got around to approving - approval lag must
 * never inflate the piece's elapsed time. Falls back to "now" only when the
 * request timestamp is missing/invalid or earlier than the session start.
 */
export function stopRequestEndedAt(
  requestedAt: string | null | undefined,
  startedAt: string,
  now: () => Date = () => new Date()
): string {
  const requestedMs = Date.parse(requestedAt ?? "");
  const startedMs = Date.parse(startedAt);
  if (Number.isFinite(requestedMs) && Number.isFinite(startedMs) && requestedMs >= startedMs) {
    return new Date(requestedMs).toISOString();
  }
  return now().toISOString();
}

async function applyApprovedMutation(
  request: SewingSessionChangeRequest,
  decidedBy: string
): Promise<Result<{ detail?: string }>> {
  if (request.action === "pause_kiosk") {
    const settings = await setStitchKioskPaused(true, { actedBy: decidedBy });
    try {
      await notifyIntegration("production.stitch_kiosk_pause_updated", {
        paused: settings.paused,
        paused_at: settings.paused_at,
        paused_by: settings.paused_by,
        resumed_at: settings.resumed_at,
        resumed_by: settings.resumed_by,
        updated_at: settings.updated_at,
        updated_by: decidedBy,
        via_change_request: request.id,
      });
    } catch {
      /* non-fatal */
    }
    return { ok: true, detail: "Kiosk paused." };
  }

  if (request.action === "delete_failure") {
    const failureId = request.failure_id;
    if (!failureId) {
      return { ok: false, status: 400, error: "Request is missing failure_id." };
    }
    const store = await readSewingScanFailuresFresh();
    if (!store.failures.some((row) => row.id === failureId)) {
      return { ok: false, status: 409, error: "Failed scan no longer exists." };
    }
    await writeSewingScanFailures(
      {
        ...store,
        failures: store.failures.filter((row) => row.id !== failureId),
      },
      { allowFailureDeleteIds: [failureId] }
    );
    return { ok: true, detail: "Failed scan deleted." };
  }

  const sessionId = request.session_id;
  if (!sessionId) {
    return { ok: false, status: 400, error: "Request is missing session_id." };
  }
  const store = await readSewingSessionsFresh();
  const index = store.sessions.findIndex((row) => row.id === sessionId);
  if (index < 0) {
    return { ok: false, status: 409, error: "Session no longer exists." };
  }
  const current = store.sessions[index]!;

  if (request.action === "delete") {
    const productionCode = current.production_code;
    const nextSessions = store.sessions.filter((row) => row.id !== sessionId);
    const nextArms = (store.kiosk_arms ?? []).filter(
      (arm) => arm.employee_id !== current.employee_id
    );
    const nextPieceArms = (store.kiosk_piece_arms ?? []).filter(
      (arm) => arm.production_code !== productionCode
    );
    await writeSewingSessions(
      {
        ...store,
        sessions: nextSessions,
        kiosk_arms: nextArms,
        kiosk_piece_arms: nextPieceArms,
      },
      { allowSessionDeleteIds: [sessionId] }
    );
    return { ok: true, detail: "Session deleted." };
  }

  if (request.action === "stop") {
    if (current.status !== "open" && current.status !== "closing") {
      return { ok: false, status: 409, error: "Session is no longer open; cannot stop." };
    }
    const endedAt = stopRequestEndedAt(request.requested_at, current.started_at);
    const closed: SewingSession = {
      ...current,
      status: "closed",
      ended_at: endedAt,
      duration_sec: durationBetween(current.started_at, endedAt),
      closing_armed_at: null,
      closing_confirm: null,
    };
    const nextSessions = [...store.sessions];
    nextSessions[index] = closed;
    await writeSewingSessions({
      ...store,
      sessions: nextSessions,
      kiosk_arms: (store.kiosk_arms ?? []).filter(
        (arm) => arm.employee_id !== current.employee_id
      ),
      kiosk_piece_arms: (store.kiosk_piece_arms ?? []).filter(
        (arm) => arm.production_code !== current.production_code
      ),
    });
    try {
      await notifyIntegration("production.sewing_session_ended", {
        session_id: closed.id,
        kiosk_id: closed.kiosk_id,
        employee_id: closed.employee_id,
        employee_name: closed.employee_name,
        production_code: closed.production_code,
        scan_code: closed.scan_code,
        started_at: closed.started_at,
        ended_at: closed.ended_at,
        duration_sec: closed.duration_sec,
        via_change_request: request.id,
      });
    } catch {
      /* non-fatal */
    }
    return { ok: true, detail: "Session stopped." };
  }

  if (request.action === "edit") {
    const patch = cleanPatch(request.proposed_patch);
    if (!patch) {
      return { ok: false, status: 400, error: "Edit request is missing proposed_patch." };
    }
    const edited = applyEditPatch(current, patch);
    if (!edited.ok) return edited;
    const nextSessions = [...store.sessions];
    nextSessions[index] = edited.session;
    await writeSewingSessions({
      ...store,
      sessions: nextSessions,
    });
    return { ok: true, detail: "Session updated." };
  }

  return { ok: false, status: 400, error: `Unsupported action: ${request.action}` };
}

export async function decideSewingSessionChangeRequest(
  requestId: string,
  decision: "approve" | "reject",
  actor: string,
  options: { decision_note?: string | null; source?: "erp" | "api" } = {}
): Promise<Result<{ request: SewingSessionChangeRequest; detail?: string }>> {
  await ensureDocumentsLoaded([
    "sewing_session_change_requests",
    "sewing_sessions",
    "sewing_scan_failures",
    "stitch_kiosk_settings",
    "payroll_employees",
  ]);

  const store = await readSewingSessionChangeRequestsFresh();
  const current = store.requests.find((row) => row.id === requestId.trim());
  if (!current) return { ok: false, status: 404, error: "Change request not found." };
  if (current.status !== "pending") {
    return { ok: false, status: 400, error: "Request is no longer pending." };
  }

  const decidedBy = actor.trim() || "admin";
  const decidedAt = new Date().toISOString();
  const decisionNote = options.decision_note?.trim() || null;
  const source = options.source ?? "erp";

  if (decision === "reject") {
    const rejected = await persistRequestDecision(current.id, {
      status: "rejected",
      decided_by: decidedBy,
      decided_at: decidedAt,
      decision_note: decisionNote,
    });
    if (!rejected) return { ok: false, status: 404, error: "Change request not found." };
    try {
      await notifyIntegration(
        "production.sewing_session_change_rejected",
        {
          request_id: rejected.id,
          action: rejected.action,
          session_id: rejected.session_id,
          failure_id: rejected.failure_id,
          decided_by: rejected.decided_by,
          decision_note: rejected.decision_note,
        },
        source
      );
    } catch {
      /* non-fatal */
    }
    await notifyRequesterOfAdminDecision({
      requester: rejected.requested_by,
      subject: `ERP: kiosk request REJECTED (${summarizeSewingSessionChangeRequest(rejected).label})`,
      lines: [
        "Your stitch kiosk change request was rejected - nothing was changed.",
        "",
        `- Request: ${summarizeSewingSessionChangeRequest(rejected).label}`,
        `  Rejected by: ${decidedBy}`,
        decisionNote ? `  Note: ${decisionNote}` : null,
      ].filter((line): line is string => line !== null),
    });
    return { ok: true, request: rejected };
  }

  const applied = await applyApprovedMutation(current, decidedBy);
  if (!applied.ok) {
    return applied;
  }

  const approved = await persistRequestDecision(current.id, {
    status: "approved",
    decided_by: decidedBy,
    decided_at: decidedAt,
    decision_note: decisionNote,
  });
  if (!approved) return { ok: false, status: 404, error: "Change request not found." };

  try {
    await notifyIntegration(
      "production.sewing_session_change_approved",
      {
        request_id: approved.id,
        action: approved.action,
        session_id: approved.session_id,
        failure_id: approved.failure_id,
        decided_by: approved.decided_by,
        decision_note: approved.decision_note,
        detail: applied.detail ?? null,
      },
      source
    );
  } catch {
    /* non-fatal */
  }

  await notifyRequesterOfAdminDecision({
    requester: approved.requested_by,
    subject: `ERP: kiosk request APPROVED (${summarizeSewingSessionChangeRequest(approved).label})`,
    lines: [
      "Your stitch kiosk change request was approved and applied.",
      "",
      `- Request: ${summarizeSewingSessionChangeRequest(approved).label}`,
      `  Approved by: ${decidedBy}`,
      applied.detail ? `  Result: ${applied.detail}` : null,
      decisionNote ? `  Note: ${decisionNote}` : null,
    ].filter((line): line is string => line !== null),
  });

  return { ok: true, request: approved, detail: applied.detail };
}
