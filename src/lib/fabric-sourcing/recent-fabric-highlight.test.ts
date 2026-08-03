import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isRecentlyAddedCustomFabric,
  recentCustomFabricAddedLabel,
} from "./recent-fabric-highlight.ts";

const NOW = new Date("2026-08-03T15:00:00Z");

describe("isRecentlyAddedCustomFabric", () => {
  it("is true for a custom fabric created today", () => {
    const fabric = {
      kind: "custom" as const,
      created_at: "2026-08-03T08:51:41.707Z",
      created_by: "hagan.qc@gmail.com",
    };
    assert.equal(isRecentlyAddedCustomFabric(fabric, NOW), true);
  });

  it("is true within the 7-day window and false after it", () => {
    const base = { kind: "custom" as const, created_by: null };
    assert.equal(
      isRecentlyAddedCustomFabric({ ...base, created_at: "2026-07-28T15:00:00Z" }, NOW),
      true
    );
    assert.equal(
      isRecentlyAddedCustomFabric({ ...base, created_at: "2026-07-26T15:00:00Z" }, NOW),
      false
    );
  });

  it("respects a custom window", () => {
    const fabric = { kind: "custom" as const, created_at: "2026-08-01T15:00:00Z", created_by: null };
    assert.equal(isRecentlyAddedCustomFabric(fabric, NOW, 1), false);
    assert.equal(isRecentlyAddedCustomFabric(fabric, NOW, 3), true);
  });

  it("ignores catalog fabrics even with a recent created_at", () => {
    const fabric = { kind: undefined, created_at: "2026-08-03T08:00:00Z", created_by: null };
    assert.equal(isRecentlyAddedCustomFabric(fabric, NOW), false);
  });

  it("is false without created_at or with an invalid date", () => {
    assert.equal(
      isRecentlyAddedCustomFabric({ kind: "custom", created_at: null, created_by: null }, NOW),
      false
    );
    assert.equal(
      isRecentlyAddedCustomFabric(
        { kind: "custom", created_at: "not-a-date", created_by: null },
        NOW
      ),
      false
    );
  });

  it("tolerates small clock skew (created_at slightly in the future)", () => {
    const fabric = { kind: "custom" as const, created_at: "2026-08-03T15:00:30Z", created_by: null };
    assert.equal(isRecentlyAddedCustomFabric(fabric, NOW), true);
  });
});

describe("recentCustomFabricAddedLabel", () => {
  it("maps a known email to its display name", () => {
    const fabric = {
      kind: "custom" as const,
      created_at: "2026-08-03T08:51:41.707Z",
      created_by: "hagan.qc@gmail.com",
    };
    assert.equal(recentCustomFabricAddedLabel(fabric), "QC Hossein - 3 Aug");
  });

  it("falls back to the raw email for unmapped creators", () => {
    const fabric = {
      kind: "custom" as const,
      created_at: "2026-08-03T09:00:00Z",
      created_by: "someone@example.com",
    };
    assert.equal(recentCustomFabricAddedLabel(fabric), "someone@example.com - 3 Aug");
  });

  it("shows only the date when created_by is missing", () => {
    const fabric = { kind: "custom" as const, created_at: "2026-08-03T09:00:00Z", created_by: null };
    assert.equal(recentCustomFabricAddedLabel(fabric), "Added 3 Aug");
  });

  it("returns null without a valid created_at", () => {
    assert.equal(
      recentCustomFabricAddedLabel({ kind: "custom", created_at: null, created_by: null }),
      null
    );
  });
});
