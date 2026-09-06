import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateCorrectedStartAt } from "./manual-start-time.ts";

describe("validateCorrectedStartAt", () => {
  const now = Date.parse("2026-09-06T12:00:00.000Z");

  it("accepts an earlier Riyadh time on the same workday", () => {
    const result = validateCorrectedStartAt({
      startedAt: "2026-09-06T10:15",
      currentStartedAt: "2026-09-06T12:00:00.000Z",
      nowMs: now,
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.match(result.iso, /2026-09-06T/);
  });

  it("rejects the same instant as the scan", () => {
    const result = validateCorrectedStartAt({
      startedAt: "2026-09-06T15:00",
      currentStartedAt: "2026-09-06T12:00:00.000Z",
      nowMs: now,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /different start time/i);
  });

  it("rejects a start after the session already ended", () => {
    const result = validateCorrectedStartAt({
      startedAt: "2026-09-06T11:30",
      currentStartedAt: "2026-09-06T08:00:00.000Z",
      endedAt: "2026-09-06T08:20:00.000Z",
      nowMs: now,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /after the session end/i);
  });
});
