import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateTudPatternCode,
  generateTudPiecePatternCode,
  listTudPiecePatternCodes,
} from "./tud-pattern-code.ts";

const suitJob = {
  client_code: "FR-0126-0019",
  so_number: "SO-2026-0132",
  article_number: 7,
  garment_type: "Suit",
  piece_names: ["Jacket", "Trouser"],
  piece_name: "Jacket",
};

describe("generateTudPatternCode", () => {
  it("builds garment-level Tuka filename stem", () => {
    assert.equal(generateTudPatternCode(suitJob), "FR-0132-L07-SUIT");
  });
});

describe("listTudPiecePatternCodes", () => {
  it("builds Suit piece codes matching manufacturing n/N marks", () => {
    const codes = listTudPiecePatternCodes(suitJob);
    assert.deepEqual(
      codes.map((entry) => entry.code),
      ["FR-0132-L07-JKT-1/2", "FR-0132-L07-TR-2/2"]
    );
    assert.equal(codes[0]!.piece_name, "Jacket");
    assert.equal(codes[1]!.piece_name, "Trouser");
  });

  it("builds Suit+Vest three piece codes", () => {
    const codes = listTudPiecePatternCodes({
      ...suitJob,
      garment_type: "Suit+Vest",
      piece_names: ["Jacket", "Vest", "Trouser"],
    });
    assert.deepEqual(
      codes.map((entry) => entry.code),
      ["FR-0132-L07-JKT-1/3", "FR-0132-L07-VST-2/3", "FR-0132-L07-TR-3/3"]
    );
  });

  it("omits index mark for single-piece garments", () => {
    const codes = listTudPiecePatternCodes({
      client_code: "FR-0126-0019",
      so_number: "SO-2026-0132",
      article_number: 3,
      garment_type: "Shirt LS",
      piece_names: ["Shirt LS"],
      piece_name: "Shirt LS",
    });
    assert.equal(codes.length, 1);
    assert.equal(codes[0]!.code, "FR-0132-L03-SHT-LS");
  });
});

describe("generateTudPiecePatternCode", () => {
  it("builds one piece stem with index mark", () => {
    assert.equal(
      generateTudPiecePatternCode(suitJob, "Jacket", 1, 2),
      "FR-0132-L07-JKT-1/2"
    );
  });
});
