import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isWedgeTerminatorKey,
  shouldStealKeyAsWedge,
} from "@/lib/production/stitch-scan-wedge";

describe("isWedgeTerminatorKey", () => {
  it("accepts Enter and Tab suffixes", () => {
    assert.equal(isWedgeTerminatorKey("Enter"), true);
    assert.equal(isWedgeTerminatorKey("Tab"), true);
    assert.equal(isWedgeTerminatorKey(" "), false);
    assert.equal(isWedgeTerminatorKey("a"), false);
  });
});

describe("shouldStealKeyAsWedge", () => {
  const rapidGapMs = 90;

  it("always continues an in-progress buffer", () => {
    assert.equal(
      shouldStealKeyAsWedge({
        alreadyBuffering: true,
        gapMs: 500,
        rapidGapMs,
        inManualEntryField: true,
      }),
      true
    );
  });

  it("steals rapid bursts even over a search/manual field", () => {
    assert.equal(
      shouldStealKeyAsWedge({
        alreadyBuffering: false,
        gapMs: 25,
        rapidGapMs,
        inManualEntryField: true,
      }),
      true
    );
  });

  it("steals non-manual focus (body/button/selection) at any speed", () => {
    assert.equal(
      shouldStealKeyAsWedge({
        alreadyBuffering: false,
        gapMs: 5000,
        rapidGapMs,
        inManualEntryField: false,
      }),
      true
    );
  });

  it("allows slow typing into a manual field when not buffering", () => {
    assert.equal(
      shouldStealKeyAsWedge({
        alreadyBuffering: false,
        gapMs: 200,
        rapidGapMs,
        inManualEntryField: true,
      }),
      false
    );
  });
});
