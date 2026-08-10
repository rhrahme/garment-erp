import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isStitchLunchPauseWindow,
  riyadhWallTimeToUtcMs,
  shouldAutoResumeStitchKioskLunch,
  stitchLunchAutoResumeAtIsoForPause,
  stitchLunchResumeAtMs,
} from "./stitch-kiosk-lunch.ts";

// 2026-08-10 14:00 Asia/Riyadh = 11:00 UTC
const lunchPauseMs = Date.parse("2026-08-10T11:00:00.000Z");
// 2026-08-10 16:00 Asia/Riyadh = 13:00 UTC
const resumeMs = Date.parse("2026-08-10T13:00:00.000Z");
// 2026-08-10 15:30 Asia/Riyadh
const midLunchMs = Date.parse("2026-08-10T12:30:00.000Z");
// 2026-08-10 17:00 Asia/Riyadh
const afterResumeMs = Date.parse("2026-08-10T14:00:00.000Z");
// 2026-08-10 10:00 Asia/Riyadh
const morningMs = Date.parse("2026-08-10T07:00:00.000Z");

test("riyadh wall time maps to expected UTC", () => {
  assert.equal(riyadhWallTimeToUtcMs(2026, 8, 10, 16, 0), resumeMs);
  assert.equal(stitchLunchResumeAtMs(lunchPauseMs), resumeMs);
});

test("lunch pause window is 14:00-16:00 Riyadh same day", () => {
  assert.equal(
    isStitchLunchPauseWindow("2026-08-10T11:00:00.000Z", midLunchMs),
    true
  );
  assert.equal(
    isStitchLunchPauseWindow("2026-08-10T07:00:00.000Z", midLunchMs),
    false
  );
  assert.equal(
    isStitchLunchPauseWindow("2026-08-10T14:00:00.000Z", afterResumeMs),
    false
  );
});

test("auto-resume only after 16:00 for lunch pauses", () => {
  assert.equal(
    shouldAutoResumeStitchKioskLunch({
      paused: true,
      paused_at: "2026-08-10T11:00:00.000Z",
      nowMs: midLunchMs,
    }),
    false
  );
  assert.equal(
    shouldAutoResumeStitchKioskLunch({
      paused: true,
      paused_at: "2026-08-10T11:00:00.000Z",
      nowMs: resumeMs,
    }),
    true
  );
  assert.equal(
    shouldAutoResumeStitchKioskLunch({
      paused: true,
      paused_at: "2026-08-10T11:00:00.000Z",
      nowMs: afterResumeMs,
    }),
    true
  );
  assert.equal(
    shouldAutoResumeStitchKioskLunch({
      paused: false,
      paused_at: "2026-08-10T11:00:00.000Z",
      nowMs: afterResumeMs,
    }),
    false
  );
});

test("emergency pause after 16:00 does not auto-resume", () => {
  assert.equal(
    shouldAutoResumeStitchKioskLunch({
      paused: true,
      paused_at: "2026-08-10T14:00:00.000Z",
      nowMs: afterResumeMs,
    }),
    false
  );
});

test("auto_resume_at wins when set", () => {
  assert.equal(
    shouldAutoResumeStitchKioskLunch({
      paused: true,
      paused_at: "2026-08-10T11:00:00.000Z",
      auto_resume_at: "2026-08-10T13:00:00.000Z",
      nowMs: midLunchMs,
    }),
    false
  );
  assert.equal(
    shouldAutoResumeStitchKioskLunch({
      paused: true,
      paused_at: "2026-08-10T11:00:00.000Z",
      auto_resume_at: "2026-08-10T13:00:00.000Z",
      nowMs: resumeMs,
    }),
    true
  );
});

test("pause in lunch window gets auto_resume_at at 16:00", () => {
  assert.equal(
    stitchLunchAutoResumeAtIsoForPause(lunchPauseMs),
    "2026-08-10T13:00:00.000Z"
  );
  assert.equal(stitchLunchAutoResumeAtIsoForPause(morningMs), null);
  assert.equal(stitchLunchAutoResumeAtIsoForPause(afterResumeMs), null);
});
