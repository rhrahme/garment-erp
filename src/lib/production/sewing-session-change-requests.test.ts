import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { protectSewingSessionChangeRequestsWrite } from "@/lib/production/protect-sewing-session-change-requests-write";
import {
  applyStopRequestToSession,
  stopRequestEndedAt,
} from "@/lib/production/sewing-session-change-requests";
import type { SewingSession } from "@/lib/types/sewing-sessions";
import { summarizeSewingSessionChangeRequest } from "@/lib/production/sewing-session-change-request-summary";
import type { SewingSessionChangeRequest } from "@/lib/types/sewing-session-change-requests";

function baseRequest(
  partial: Partial<SewingSessionChangeRequest> = {}
): SewingSessionChangeRequest {
  return {
    id: "sscr-1",
    status: "pending",
    action: "delete",
    session_id: "sew-1",
    failure_id: null,
    session_snapshot: {
      id: "sew-1",
      status: "closed",
      employee_id: "e1",
      employee_name: "Ijaz",
      employee_id_number: "2631625189",
      production_code: "FR-0133-L18-TR-2/2",
      scan_code: "FR-0133-L18-TR-2/2",
      piece_mark: "TR-2/2",
      fabric_number: "771020",
      garment_type: "Overshirt+Trouser",
      client_name: "Pr Khaled",
      so_number: "SO-2026-0133",
      started_at: "2026-08-10T07:55:42.955Z",
      ended_at: "2026-08-10T07:55:50.972Z",
      duration_sec: 8,
      work_kind: "first_make",
      activity_job_function: null,
      kiosk_id: "laptop-1",
    },
    failure_snapshot: null,
    proposed_patch: null,
    reason: "wrong fabric",
    requested_by: "stitch@hagan.pro",
    requested_at: "2026-08-10T08:00:00.000Z",
    decided_by: null,
    decided_at: null,
    decision_note: null,
    ...partial,
  };
}

describe("stopRequestEndedAt", () => {
  const startedAt = "2026-08-16T10:00:00.000Z";
  const now = () => new Date("2026-08-17T20:00:00.000Z");

  it("closes at the request time, not the admin approval time", () => {
    assert.equal(
      stopRequestEndedAt("2026-08-16T14:00:00.000Z", startedAt, now),
      "2026-08-16T14:00:00.000Z"
    );
  });

  it("falls back to now when the request timestamp is missing or invalid", () => {
    assert.equal(stopRequestEndedAt(null, startedAt, now), now().toISOString());
    assert.equal(stopRequestEndedAt("not-a-date", startedAt, now), now().toISOString());
  });

  it("falls back to now when the request predates the session start", () => {
    assert.equal(
      stopRequestEndedAt("2026-08-16T09:00:00.000Z", startedAt, now),
      now().toISOString()
    );
  });
});

describe("applyStopRequestToSession", () => {
  const closed: SewingSession = {
    id: "sew-closed",
    kiosk_id: "k1",
    employee_id: "e1",
    employee_name: "Ibrahim",
    employee_id_number: "1",
    production_code: "FR-0141-L04-TR",
    scan_code: "FR-0141-L04-TR",
    workstation_id: null,
    started_at: "2026-08-20T05:00:00.000Z",
    ended_at: "2026-08-21T08:00:00.000Z",
    duration_sec: 97200,
    status: "closed",
    closing_armed_at: null,
    work_order_id: null,
    so_number: "SO-2026-0141",
    piece_mark: "TR",
    fabric_cut_code: null,
    client_name: "Pr Khaled",
  };

  it("acknowledges Confirm Stop on an already-closed session and clamps inflated end time", () => {
    const applied = applyStopRequestToSession(closed, "2026-08-20T14:00:00.000Z");
    assert.equal(applied.alreadyClosed, true);
    assert.equal(applied.changed, true);
    assert.equal(applied.session.status, "closed");
    assert.equal(applied.session.ended_at, "2026-08-20T14:00:00.000Z");
  });

  it("acknowledges an already-closed session without changing a tighter end time", () => {
    const applied = applyStopRequestToSession(
      { ...closed, ended_at: "2026-08-20T12:00:00.000Z", duration_sec: 25200 },
      "2026-08-20T16:00:00.000Z"
    );
    assert.equal(applied.alreadyClosed, true);
    assert.equal(applied.changed, false);
    assert.equal(applied.session.ended_at, "2026-08-20T12:00:00.000Z");
  });
});

describe("summarizeSewingSessionChangeRequest", () => {
  it("labels session deletes with production code", () => {
    const summary = summarizeSewingSessionChangeRequest(baseRequest());
    assert.equal(summary.action, "delete");
    assert.match(summary.label, /FR-0133-L18-TR-2\/2/);
    assert.equal(summary.fabric_number, "771020");
    assert.equal(summary.garment_type, "Overshirt+Trouser");
    assert.ok(summary.client_name?.includes("Khaled"));
    assert.ok(summary.client_label?.includes("Khaled"));
  });

  it("labels overtime confirm requests", () => {
    const summary = summarizeSewingSessionChangeRequest(
      baseRequest({ action: "overtime_confirm" })
    );
    assert.match(summary.label, /Overtime to confirm/);
  });

  it("shows the badge nickname, not the legal name", () => {
    const summary = summarizeSewingSessionChangeRequest(
      baseRequest({
        session_snapshot: {
          ...baseRequest().session_snapshot!,
          employee_id: "2631625072",
          employee_name: "PARVAIZ AHMAD KARAM DIN BHATTI",
        },
      })
    );
    assert.equal(summary.employee_name, "Parvaiz");
  });

  it("labels started-without-QR requests", () => {
    const summary = summarizeSewingSessionChangeRequest(
      baseRequest({ action: "started_without_qr" })
    );
    assert.match(summary.label, /Started without QR/);
    assert.equal(summary.started_at, "2026-08-10T07:55:42.955Z");
  });

  it("labels corrected start-time requests with the new time", () => {
    const summary = summarizeSewingSessionChangeRequest(
      baseRequest({
        action: "correct_start_time",
        proposed_patch: { started_at: "2026-08-10T06:30:00.000Z" },
      })
    );
    assert.match(summary.label, /Corrected start time/);
    assert.equal(summary.started_at, "2026-08-10T06:30:00.000Z");
    assert.equal(summary.original_started_at, "2026-08-10T07:55:42.955Z");
  });

  it("labels pause kiosk requests", () => {
    const summary = summarizeSewingSessionChangeRequest(
      baseRequest({
        action: "pause_kiosk",
        session_id: null,
        session_snapshot: null,
      })
    );
    assert.equal(summary.label, "Pause stitch kiosk");
  });
});

describe("protectSewingSessionChangeRequestsWrite", () => {
  it("refuses empty wipe of pending queue", () => {
    assert.throws(
      () =>
        protectSewingSessionChangeRequestsWrite(
          { requests: [{ id: "r1", status: "pending" }] },
          { requests: [] }
        ),
      /wipe sewing_session_change_requests/
    );
  });

  it("merges remote requests missing from stale incoming", () => {
    const next = protectSewingSessionChangeRequestsWrite(
      {
        requests: [
          { id: "r-old", status: "pending" },
          { id: "r-new", status: "approved" },
        ],
      },
      { requests: [{ id: "r-new", status: "approved" }] }
    );
    assert.deepEqual(
      (next.requests ?? []).map((row) => row.id).sort(),
      ["r-new", "r-old"]
    );
  });
});
