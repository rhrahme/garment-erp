import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyHereArm,
  ATTENDANCE_BEFORE_GO_LIVE_MESSAGE,
  ATTENDANCE_CLOCK_IN_GO_LIVE_RIYADH_DAY,
  ATTENDANCE_WALL_QR_PAYLOAD,
  checkInCountsForAttendance,
  clearHereArm,
  hereArmOnKiosk,
  hereClockInMessage,
  isAttendanceClockInLive,
  isHereWallQr,
  riyadhWorkdayKey,
  STITCH_HERE_QR_PAYLOAD,
  upsertHereCheckIn,
} from "@/lib/production/stitch-attendance";
import { expireStaleSewingState, SEWING_ARM_TIMEOUT_MS } from "@/lib/production/sewing-session-state";
import type { SewingSessionsFile } from "@/lib/types/sewing-sessions";
import type { StitchAttendanceFile } from "@/lib/types/stitch-attendance";

function emptyStore(): SewingSessionsFile {
  return {
    updated_at: null,
    kiosk_arms: [],
    kiosk_piece_arms: [],
    kiosk_here_arms: [],
    sessions: [],
  };
}

describe("HERE wall QR", () => {
  it("accepts ATTEND and hung HAGAN-HERE posters, never a badge or A4", () => {
    assert.equal(ATTENDANCE_WALL_QR_PAYLOAD, "ATTEND");
    assert.equal(isHereWallQr(ATTENDANCE_WALL_QR_PAYLOAD), true);
    assert.equal(isHereWallQr("  attend  "), true);
    assert.equal(isHereWallQr(STITCH_HERE_QR_PAYLOAD), true);
    assert.equal(isHereWallQr("  hagan-here  "), true);
    assert.equal(isHereWallQr("EMP:2587734852"), false);
    assert.equal(isHereWallQr("FR-0132-L07-JKT-1/2"), false);
  });

  it("does not count 7 Sep Riyadh and does count 8 Sep Riyadh", () => {
    assert.equal(riyadhWorkdayKey(Date.parse("2026-09-07T20:30:00.000Z")), "2026-09-07");
    assert.equal(isAttendanceClockInLive(Date.parse("2026-09-07T20:30:00.000Z")), false);
    assert.equal(
      riyadhWorkdayKey(Date.parse("2026-09-07T21:00:00.000Z")),
      ATTENDANCE_CLOCK_IN_GO_LIVE_RIYADH_DAY
    );
    assert.equal(isAttendanceClockInLive(Date.parse("2026-09-07T21:00:00.000Z")), true);
    assert.match(ATTENDANCE_BEFORE_GO_LIVE_MESSAGE, /Test scan received/);
    assert.match(ATTENDANCE_BEFORE_GO_LIVE_MESSAGE, /tomorrow/i);
    assert.match(ATTENDANCE_BEFORE_GO_LIVE_MESSAGE, /does not start a piece/);
  });

  it("arms one HERE wait per kiosk and clears it after clock-in", () => {
    let store = applyHereArm(emptyStore(), {
      kiosk_id: "k1",
      armed_at: "2026-09-07T04:00:00.000Z",
    });
    assert.equal(hereArmOnKiosk(store, "k1")?.kiosk_id, "k1");
    store = applyHereArm(store, { kiosk_id: "k1", armed_at: "2026-09-07T04:00:10.000Z" });
    assert.equal(store.kiosk_here_arms?.length, 1);
    store = clearHereArm(store, "k1");
    assert.equal(hereArmOnKiosk(store, "k1"), null);
  });

  it("expires a stale HERE wait after the 30s arm window", () => {
    const at = Date.parse("2026-09-07T04:00:30.000Z");
    const store = applyHereArm(emptyStore(), {
      kiosk_id: "k1",
      armed_at: new Date(at - SEWING_ARM_TIMEOUT_MS - 1).toISOString(),
    });
    const next = expireStaleSewingState(store, at);
    assert.equal(hereArmOnKiosk(next, "k1"), null);
  });

  it("upserts one check-in per employee per Riyadh workday", () => {
    const workday = riyadhWorkdayKey(Date.parse("2026-09-07T05:00:00.000Z"));
    const first = upsertHereCheckIn(
      { updated_at: null, check_ins: [] } satisfies StitchAttendanceFile,
      {
        employee_id: "e1",
        employee_name: "Haider",
        employee_id_number: "111",
        kiosk_id: "k1",
        scanned_at: "2026-09-07T05:00:00.000Z",
        workday,
      }
    );
    assert.equal(first.created, true);
    const again = upsertHereCheckIn(first.store, {
      employee_id: "e1",
      employee_name: "Haider",
      employee_id_number: "111",
      kiosk_id: "k1",
      scanned_at: "2026-09-07T05:10:00.000Z",
      workday,
    });
    assert.equal(again.created, false);
    assert.equal(again.store.check_ins.length, 1);
    assert.equal(again.check_in.scanned_at, "2026-09-07T05:00:00.000Z");
    assert.match(hereClockInMessage("Haider", Date.parse("2026-09-08T04:12:00.000Z")), /Haider signed in/);
    assert.match(
      hereClockInMessage("Haider", Date.parse("2026-09-08T04:12:00.000Z")),
      /Attendance only/
    );
    assert.match(
      hereClockInMessage("Haider", Date.parse("2026-09-08T04:12:00.000Z")),
      /Scan badge and A4 later/
    );
    assert.equal(
      checkInCountsForAttendance({ scanned_at: "2026-09-07T08:00:00.000Z" }),
      false
    );
    assert.equal(
      checkInCountsForAttendance({ scanned_at: "2026-09-08T05:00:00.000Z" }),
      true
    );
  });
});
