import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  protectSewingScanFailuresWrite,
  protectSewingSessionsWrite,
} from "@/lib/production/protect-sewing-document-write";

describe("protectSewingSessionsWrite", () => {
  it("refuses accidental empty wipe when remote has sessions", () => {
    assert.throws(
      () =>
        protectSewingSessionsWrite(
          {
            kiosk_arms: [{ employee_id: "e1" }],
            kiosk_piece_arms: [],
            sessions: [{ id: "s1", status: "open" }],
          },
          { kiosk_arms: [], kiosk_piece_arms: [], sessions: [] }
        ),
      /wipe sewing_sessions/
    );
  });

  it("allows explicit testing reset wipe", () => {
    const next = protectSewingSessionsWrite(
      {
        kiosk_arms: [{ employee_id: "e1" }],
        sessions: [{ id: "s1", status: "open" }],
      },
      {
        allow_testing_reset: true,
        kiosk_arms: [],
        kiosk_piece_arms: [],
        sessions: [],
      }
    );
    assert.deepEqual(next.kiosk_arms, []);
    assert.deepEqual(next.sessions, []);
    assert.equal("allow_testing_reset" in next, false);
  });

  it("keeps remote sessions missing from a stale incoming write", () => {
    const next = protectSewingSessionsWrite(
      {
        kiosk_arms: [],
        kiosk_piece_arms: [],
        sessions: [
          { id: "s-old", status: "closed" },
          { id: "s-new", status: "open" },
        ],
      },
      {
        kiosk_arms: [],
        kiosk_piece_arms: [],
        sessions: [{ id: "s-new", status: "open" }],
      }
    );
    assert.deepEqual(
      (next.sessions ?? []).map((session) => session.id).sort(),
      ["s-new", "s-old"]
    );
  });
});

describe("protectSewingScanFailuresWrite", () => {
  it("refuses wiping the failure audit log", () => {
    assert.throws(
      () =>
        protectSewingScanFailuresWrite(
          { failures: [{ id: "f1" }, { id: "f2" }] },
          { failures: [] }
        ),
      /wipe sewing_scan_failures/
    );
  });

  it("keeps the longer remote failure list on stale shorter write", () => {
    const next = protectSewingScanFailuresWrite(
      { failures: [{ id: "f1" }, { id: "f2" }, { id: "f3" }] },
      { failures: [{ id: "f1" }] }
    );
    assert.equal(next.failures!.length, 3);
  });
});
