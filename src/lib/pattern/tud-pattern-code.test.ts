import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateTudPatternCode,
  needsTudPatternCode,
  shortSoNumber,
} from "@/lib/pattern/tud-pattern-code";

describe("tud pattern code", () => {
  it("shortens SO numbers to last 4 digits", () => {
    assert.equal(shortSoNumber("SO-2026-0132"), "0132");
    assert.equal(shortSoNumber("SO-0132"), "0132");
  });

  it("builds brand-SO-article-garment codes for Tuka .TUD names", () => {
    assert.equal(
      generateTudPatternCode({
        client_code: "FR-0726-0039",
        so_number: "SO-2026-0132",
        article_number: 7,
        garment_type: "Suit",
      }),
      "FR-0132-L07-SUIT"
    );
  });

  it("sanitizes garment labels for filenames", () => {
    assert.equal(
      generateTudPatternCode({
        client_code: "GL-0126-0001",
        so_number: "SO-2026-0100",
        article_number: 1,
        garment_type: "Shirt LS",
      }),
      "GL-0100-L01-SHIRT-LS"
    );
  });

  it("detects empty pattern codes that need auto-fill", () => {
    assert.equal(needsTudPatternCode(null), true);
    assert.equal(needsTudPatternCode("  "), true);
    assert.equal(needsTudPatternCode("FR-0132-L07-SUIT"), false);
  });
});
