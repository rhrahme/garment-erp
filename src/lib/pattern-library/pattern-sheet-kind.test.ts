import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parsePatternSheetKind,
  patternSheetKindLabel,
} from "./pattern-sheet-kind.ts";

describe("parsePatternSheetKind", () => {
  it("defaults to cutter", () => {
    assert.equal(parsePatternSheetKind(null), "cutter");
    assert.equal(parsePatternSheetKind(undefined), "cutter");
    assert.equal(parsePatternSheetKind("cutter"), "cutter");
    assert.equal(parsePatternSheetKind("other"), "cutter");
  });

  it("accepts production", () => {
    assert.equal(parsePatternSheetKind("production"), "production");
  });
});

describe("patternSheetKindLabel", () => {
  it("labels for filenames", () => {
    assert.equal(patternSheetKindLabel("cutter"), "Cutter");
    assert.equal(patternSheetKindLabel("production"), "Production");
  });
});
