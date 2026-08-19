import assert from "node:assert/strict";
import { test } from "node:test";
import {
  capSessionCloseAtWorkdayEnd,
  isStitchLunchPauseWindow,
  riyadhWallTimeToUtcMs,
  isStitchOvertimeWindow,
  shouldAutoCloseForgottenSession,
  shouldAutoResumeStitchKioskLunch,
  stitchLunchAutoResumeAtIsoForPause,
  stitchLunchResumeAtMs,
  stitchLunchStartAtMs,
  isStitchLunchClockWindow,
  scheduledStitchLunchIntervals,
  shouldAutoPauseStitchKioskLunch,
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
  assert.equal(stitchLunchStartAtMs(midLunchMs), lunchPauseMs);
});

test("lunch clock window is 14:00-16:00 Riyadh", () => {
  assert.equal(isStitchLunchClockWindow(morningMs), false);
  assert.equal(isStitchLunchClockWindow(lunchPauseMs), true);
  assert.equal(isStitchLunchClockWindow(midLunchMs), true);
  assert.equal(isStitchLunchClockWindow(resumeMs), false);
});

test("auto-pause only while the gate is open during lunch", () => {
  assert.equal(shouldAutoPauseStitchKioskLunch({ paused: false, nowMs: midLunchMs }), true);
  assert.equal(shouldAutoPauseStitchKioskLunch({ paused: true, nowMs: midLunchMs }), false);
  assert.equal(shouldAutoPauseStitchKioskLunch({ paused: false, nowMs: morningMs }), false);
});

test("scheduled lunch intervals cover 14:00-16:00 without an admin pause", () => {
  const rows = scheduledStitchLunchIntervals(
    Date.parse("2026-08-10T07:00:00.000Z"),
    Date.parse("2026-08-10T14:00:00.000Z")
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.started_at, "2026-08-10T11:00:00.000Z");
  assert.equal(rows[0]?.ended_at, "2026-08-10T13:00:00.000Z");
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

test("overnight close caps at 22:00 Riyadh of the start day", () => {
  // Started Sat 16 Aug 11:13 Riyadh (08:13 UTC)
  const startedMs = Date.parse("2026-08-16T08:13:59.296Z");
  // 22:00 Riyadh Sat = 19:00 UTC
  const workdayEndMs = Date.parse("2026-08-16T19:00:00.000Z");
  // Closed Sun 17 Aug 12:16 Riyadh -> capped to Sat 22:00
  assert.equal(
    capSessionCloseAtWorkdayEnd(startedMs, Date.parse("2026-08-17T09:16:33.285Z")),
    workdayEndMs
  );
  // Same-day close before 22:00 stays untouched
  const sameDayMs = Date.parse("2026-08-16T13:59:49.163Z");
  assert.equal(capSessionCloseAtWorkdayEnd(startedMs, sameDayMs), sameDayMs);
  // Start after 22:00 belongs to the next workday - close next morning is
  // untouched, but a multi-day close still caps at next day 22:00
  const lateStartMs = Date.parse("2026-08-16T19:30:00.000Z");
  const nextMorningMs = Date.parse("2026-08-17T05:00:00.000Z");
  assert.equal(capSessionCloseAtWorkdayEnd(lateStartMs, nextMorningMs), nextMorningMs);
  assert.equal(
    capSessionCloseAtWorkdayEnd(lateStartMs, Date.parse("2026-08-19T05:00:00.000Z")),
    Date.parse("2026-08-17T19:00:00.000Z")
  );
});

test("forgotten open session is due to auto-close at/after 22:00 Riyadh", () => {
  const started = "2026-08-18T08:16:45.111Z";
  assert.equal(
    shouldAutoCloseForgottenSession(started, Date.parse("2026-08-18T18:59:00.000Z")),
    false
  );
  assert.equal(
    shouldAutoCloseForgottenSession(started, Date.parse("2026-08-18T19:00:00.000Z")),
    true
  );
  assert.equal(
    shouldAutoCloseForgottenSession(started, Date.parse("2026-08-18T22:00:00.000Z")),
    true
  );
  const lateStart = "2026-08-18T19:30:00.000Z";
  assert.equal(
    shouldAutoCloseForgottenSession(lateStart, Date.parse("2026-08-18T22:00:00.000Z")),
    false
  );
});

test("overtime window is 22:00 through 07:59 Riyadh", () => {
  assert.equal(isStitchOvertimeWindow(Date.parse("2026-08-18T18:59:00.000Z")), false);
  assert.equal(isStitchOvertimeWindow(Date.parse("2026-08-18T19:00:00.000Z")), true);
  assert.equal(isStitchOvertimeWindow(Date.parse("2026-08-18T22:30:00.000Z")), true);
  assert.equal(isStitchOvertimeWindow(Date.parse("2026-08-19T04:59:00.000Z")), true);
  assert.equal(isStitchOvertimeWindow(Date.parse("2026-08-19T05:00:00.000Z")), false);
});
