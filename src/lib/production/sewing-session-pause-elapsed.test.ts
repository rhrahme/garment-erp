import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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
    // 90 min wall - 30 min lunch = 60 min
    assert.equal(sec, 60 * 60);
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
});

describe("sewingSessionElapsedBreakdown", () => {
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
