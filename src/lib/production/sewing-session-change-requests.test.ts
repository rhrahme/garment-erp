import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { protectSewingSessionChangeRequestsWrite } from "@/lib/production/protect-sewing-session-change-requests-write";
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

describe("summarizeSewingSessionChangeRequest", () => {
  it("labels session deletes with production code", () => {
    const summary = summarizeSewingSessionChangeRequest(baseRequest());
    assert.equal(summary.action, "delete");
    assert.match(summary.label, /FR-0133-L18-TR-2\/2/);
    assert.equal(summary.fabric_number, "771020");
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
