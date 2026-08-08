import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parsePatternSheetKind,
  parsePatternSheetLineIds,
  patternSheetKindLabel,
} from "@/lib/pattern-library/pattern-sheet-kind";

describe("pattern sheet kind", () => {
  it("parses sewing / production / cutter", () => {
    assert.equal(parsePatternSheetKind("sewing"), "sewing");
    assert.equal(parsePatternSheetKind("production"), "production");
    assert.equal(parsePatternSheetKind("cutter"), "cutter");
    assert.equal(parsePatternSheetKind("nope"), "cutter");
    assert.equal(patternSheetKindLabel("sewing"), "Sewing");
  });

  it("parses selected line ids for sewing A4 preview", () => {
    assert.equal(parsePatternSheetLineIds(null), null);
    assert.deepEqual(parsePatternSheetLineIds(""), []);
    assert.deepEqual(parsePatternSheetLineIds("a,b , c"), ["a", "b", "c"]);
  });
});
