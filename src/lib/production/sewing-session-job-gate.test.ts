import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { employeeCanSewOnStitchKiosk } from "@/lib/hr/job-functions";
import {
  badgeDecisionRequiresSewCapability,
  decideBadgeScan,
} from "@/lib/production/sewing-session-recovery";
import type { SewingSession, SewingSessionsFile } from "@/lib/types/sewing-sessions";

function session(
  partial: Partial<SewingSession> & Pick<SewingSession, "id" | "employee_id" | "employee_name" | "status">
): SewingSession {
  return {
    kiosk_id: "k1",
    employee_id_number: "100",
    production_code: "FR-A",
    scan_code: "FR-A",
    workstation_id: null,
    started_at: new Date().toISOString(),
    ended_at: null,
    duration_sec: null,
    closing_armed_at: null,
    work_order_id: null,
    so_number: null,
    piece_mark: null,
    fabric_cut_code: null,
    client_name: null,
    ...partial,
  };
}

describe("stitch kiosk job gate", () => {
  it("rejects cutter-only; allows tailor and empty jobs", () => {
    assert.equal(employeeCanSewOnStitchKiosk(["cutter"]), false);
    assert.equal(employeeCanSewOnStitchKiosk(["jacket_tailor"]), true);
    assert.equal(employeeCanSewOnStitchKiosk([]), true);
  });

  it("close still works for cutter with open session (gate skipped)", () => {
    assert.equal(badgeDecisionRequiresSewCapability("arm_employee"), true);
    assert.equal(badgeDecisionRequiresSewCapability("start_with_piece_arm"), true);
    assert.equal(badgeDecisionRequiresSewCapability("close"), false);
    assert.equal(badgeDecisionRequiresSewCapability("enter_closing_badge_first"), false);

    const openStore: SewingSessionsFile = {
      updated_at: null,
      kiosk_arms: [],
      kiosk_piece_arms: [],
      sessions: [
        session({
          id: "cutter-open",
          employee_id: "cutter-1",
          employee_name: "Cutter Ali",
          production_code: "FR-CUT",
          status: "open",
        }),
      ],
    };
    const enterClose = decideBadgeScan(openStore, "k1", "cutter-1");
    assert.equal(enterClose.type, "enter_closing_badge_first");
    assert.equal(badgeDecisionRequiresSewCapability(enterClose.type), false);
    // Non-tailor would be rejected for arm/start, but close path is allowed.
    assert.equal(
      badgeDecisionRequiresSewCapability(enterClose.type) ||
        employeeCanSewOnStitchKiosk(["cutter"]),
      false
    );

    const closingStore: SewingSessionsFile = {
      updated_at: null,
      kiosk_arms: [],
      kiosk_piece_arms: [],
      sessions: [
        session({
          id: "cutter-closing",
          employee_id: "cutter-1",
          employee_name: "Cutter Ali",
          production_code: "FR-CUT",
          status: "closing",
          closing_armed_at: new Date().toISOString(),
          closing_confirm: "badge",
        }),
      ],
    };
    const close = decideBadgeScan(closingStore, "k1", "cutter-1");
    assert.equal(close.type, "close");
    assert.equal(badgeDecisionRequiresSewCapability(close.type), false);
  });
});
