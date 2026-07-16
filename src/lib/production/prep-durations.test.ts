import assert from "node:assert/strict";
import { test } from "node:test";
import {
  currentPrepStageElapsedLabel,
  formatShortDuration,
} from "./prep-durations.ts";

test("formatShortDuration renders minutes, hours and days", () => {
  assert.equal(formatShortDuration(30 * 1000), "just now");
  assert.equal(formatShortDuration(20 * 60 * 1000), "20m");
  assert.equal(formatShortDuration(60 * 60 * 1000), "1h");
  assert.equal(formatShortDuration((2 * 60 + 5) * 60 * 1000), "2h 5m");
  assert.equal(formatShortDuration(25 * 60 * 60 * 1000), "1d 1h");
  assert.equal(formatShortDuration(-500), "just now");
});

test("currentPrepStageElapsedLabel computes elapsed per stage from timestamps", () => {
  const now = Date.parse("2026-07-16T12:00:00.000Z");
  const twentyMinAgo = "2026-07-16T11:40:00.000Z";
  const threeHoursAgo = "2026-07-16T09:00:00.000Z";

  assert.equal(
    currentPrepStageElapsedLabel("wash", { wash_started_at: twentyMinAgo }, now),
    "20m in wash"
  );
  assert.equal(
    currentPrepStageElapsedLabel("soak", { wash_started_at: twentyMinAgo }, now),
    "20m soaking"
  );
  assert.equal(
    currentPrepStageElapsedLabel("drying", { dry_started_at: threeHoursAgo }, now),
    "3h drying"
  );
  assert.equal(
    currentPrepStageElapsedLabel("iron", { iron_started_at: twentyMinAgo }, now),
    "20m ironing"
  );
});

test("currentPrepStageElapsedLabel is null for old receipts without timestamps", () => {
  assert.equal(currentPrepStageElapsedLabel("wash", {}, Date.now()), null);
  assert.equal(currentPrepStageElapsedLabel(null, {}, Date.now()), null);
});
