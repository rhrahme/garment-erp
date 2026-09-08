import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
    assert.equal(patternSheetKindLabel("production"), "Production");
    assert.equal(patternSheetKindLabel("cutter"), "Cutter");
  });

  it("parses selected line ids for sewing A4 preview", () => {
    assert.equal(parsePatternSheetLineIds(null), null);
    assert.deepEqual(parsePatternSheetLineIds(""), []);
    assert.deepEqual(parsePatternSheetLineIds("a,b , c"), ["a", "b", "c"]);
  });

  it("production print href must pass sheet=production (missing sheet defaults to cutter)", () => {
    const href = "/pattern/client-patterns/c1/print?sheet=production&so=SO-1";
    assert.match(href, /[?&]sheet=production(?:&|$)/);
    assert.equal(
      parsePatternSheetKind(new URLSearchParams("sheet=production").get("sheet")),
      "production"
    );
    assert.equal(parsePatternSheetKind(new URLSearchParams("").get("sheet")), "cutter");
  });

  it("client pattern sheet has a direct Print production control, not a hidden switch", () => {
    const detail = readFileSync("src/components/pattern/library/ClientPatternDetail.tsx", "utf8");
    assert.match(detail, /Print from this pattern sheet/);
    assert.match(detail, /sheet=production/);
    assert.match(detail, /Print production/);
    assert.equal(detail.includes('sheetKind="production"'), false);

    const printView = readFileSync(
      "src/components/pattern/library/PatternSheetPrintView.tsx",
      "utf8"
    );
    assert.match(printView, /\["cutter", "production", "sewing"\]/);
    assert.equal(printView.includes("Switch to"), false);
    assert.match(printView, /patternSheetKindLabel/);
  });
});
