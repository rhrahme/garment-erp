import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  sewingLiveClockNowMs,
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
