import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isStitchLiveClockFrozen,
  sewingLiveClockNowMs,
  sewingSessionElapsedBreakdown,
  sewingSessionElapsedSecExcludingPauses,
} from "@/lib/production/sewing-session-state";

describe("sewingSessionElapsedSecExcludingPauses", () => {
  it("freezes elapsed during an open lunch pause", () => {
    const started = "2026-08-10T10:00:00.000Z";
    const pauseStart = "2026-08-10T10:30:00.000Z";
    const wallNow = Date.parse("2026-08-10T11:00:00.000Z");
    const sec = sewingSessionElapsedSecExcludingPauses(started, wallNow, [
      { started_at: pauseStart, ended_at: null },
    ]);
    // 30 min work only - lunch hour excluded
    assert.equal(sec, 30 * 60);
  });

  it("excludes completed pause intervals after resume", () => {
    const started = "2026-08-10T10:00:00.000Z";
    const wallNow = Date.parse("2026-08-10T11:30:00.000Z");
    const sec = sewingSessionElapsedSecExcludingPauses(started, wallNow, [
      {
        started_at: "2026-08-10T10:30:00.000Z",
        ended_at: "2026-08-10T11:00:00.000Z",
      },
    ]);
    // 90 min wall - 30 min admin pause - 30 min scheduled lunch (14:00-14:30) = 30 min
    assert.equal(sec, 30 * 60);
  });

  it("excludes 14:00-16:00 Riyadh lunch with no admin pause", () => {
    // 10:00-17:00 Riyadh = 07:00-14:00 UTC; lunch 11:00-13:00 UTC
    const started = "2026-08-10T07:00:00.000Z";
    const wallNow = Date.parse("2026-08-10T14:00:00.000Z");
    const sec = sewingSessionElapsedSecExcludingPauses(started, wallNow, []);
    assert.equal(sec, 5 * 60 * 60);
  });

  it("freezes open elapsed at 14:00 Riyadh during lunch", () => {
    const started = "2026-08-10T07:00:00.000Z";
    const midLunch = Date.parse("2026-08-10T12:30:00.000Z");
    const sec = sewingSessionElapsedSecExcludingPauses(started, midLunch, []);
    // 10:00-14:00 Riyadh work only
    assert.equal(sec, 4 * 60 * 60);
  });
});

describe("sewingLiveClockNowMs", () => {
  it("uses paused_at while kiosk is paused", () => {
    const frozen = sewingLiveClockNowMs({
      wallNow: Date.parse("2026-08-10T11:00:00.000Z"),
      kioskPaused: true,
      kioskPausedAt: "2026-08-10T10:30:00.000Z",
    });
    assert.equal(frozen, Date.parse("2026-08-10T10:30:00.000Z"));
  });

  it("keeps wall now during lunch so the Lunch segment is visible", () => {
    const wallNow = Date.parse("2026-08-10T12:30:00.000Z");
    const clock = sewingLiveClockNowMs({
      wallNow,
      kioskPaused: false,
      kioskPausedAt: null,
    });
    assert.equal(clock, wallNow);
  });

  it("does not rewind to 14:00 when the lunch auto-pause is already stored", () => {
    const wallNow = Date.parse("2026-08-10T12:30:00.000Z");
    const clock = sewingLiveClockNowMs({
      wallNow,
      kioskPaused: true,
      kioskPausedAt: "2026-08-10T11:00:00.000Z",
    });
    assert.equal(clock, wallNow);
  });

  it("marks Live clocks frozen during lunch without an admin pause", () => {
    assert.equal(
      isStitchLiveClockFrozen({
        wallNow: Date.parse("2026-08-10T12:30:00.000Z"),
        kioskPaused: false,
      }),
      true
    );
    assert.equal(
      isStitchLiveClockFrozen({
        wallNow: Date.parse("2026-08-10T07:00:00.000Z"),
        kioskPaused: false,
      }),
      false
    );
  });
});

describe("sewingSessionElapsedBreakdown", () => {
  it("shows an open Lunch segment when now is inside 14:00-16:00", () => {
    const breakdown = sewingSessionElapsedBreakdown(
      "2026-08-10T07:00:00.000Z",
      Date.parse("2026-08-10T12:30:00.000Z"),
      []
    );
    assert.equal(breakdown.work_sec, 4 * 60 * 60);
    assert.equal(breakdown.pause_sec, 90 * 60);
    assert.deepEqual(
      breakdown.segments.map((s) => s.label),
      ["Before lunch", "Lunch"]
    );
  });

  it("splits before lunch / lunch / after lunch", () => {
    const breakdown = sewingSessionElapsedBreakdown(
      "2026-08-10T10:00:00.000Z",
      Date.parse("2026-08-10T13:30:00.000Z"),
      [
        {
          started_at: "2026-08-10T11:00:00.000Z",
          ended_at: "2026-08-10T13:00:00.000Z",
        },
      ]
    );
    assert.equal(breakdown.work_sec, 90 * 60);
    assert.equal(breakdown.pause_sec, 120 * 60);
    assert.deepEqual(
      breakdown.segments.map((s) => s.label),
      ["Before lunch", "Lunch", "After lunch"]
    );
    assert.deepEqual(
      breakdown.segments.map((s) => s.sec),
      [60 * 60, 120 * 60, 30 * 60]
    );
  });

  it("caps open elapsed at 22:00 Riyadh of the start day", () => {
    const breakdown = sewingSessionElapsedBreakdown(
      "2026-08-18T08:16:45.111Z",
      Date.parse("2026-08-18T22:00:00.000Z")
    );
    const capped = sewingSessionElapsedBreakdown(
      "2026-08-18T08:16:45.111Z",
      Date.parse("2026-08-18T19:00:00.000Z")
    );
    assert.equal(breakdown.work_sec, capped.work_sec);
  });
});
