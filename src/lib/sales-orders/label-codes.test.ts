import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expandFabricLabelScanInput,
  formatGarmentWithPieceList,
  formatLabelGarmentDescription,
  formatStickerPieceLine,
  getGarmentPieces,
  looksLikeFabricLabelInput,
  piecesForFabricLine,
  piecesForPatternJob,
  stickerCodesMatch,
} from "./label-codes.ts";

describe("expandFabricLabelScanInput", () => {
  it("expands supplier sticker format to fabric cut code", () => {
    assert.deepEqual(expandFabricLabelScanInput("FR-0226-0024/ 0109-L32"), [
      "FR-0226-0024/ 0109-L32",
      "FR-0109-L32",
    ]);
  });

  it("handles supplier format without space after slash", () => {
    assert.ok(expandFabricLabelScanInput("FR-0226-0024/0109-L32").includes("FR-0109-L32"));
  });

  it("passes through full piece sticker codes", () => {
    const full = "GL-0326-0003-SO-2026-0103-L04-SHT-LS";
    assert.deepEqual(expandFabricLabelScanInput(full), [full]);
  });

  it("passes through shorthand fabric cut codes", () => {
    assert.deepEqual(expandFabricLabelScanInput("FR-0109-L32"), ["FR-0109-L32"]);
  });
});

describe("looksLikeFabricLabelInput", () => {
  it("detects supplier format labels", () => {
    assert.equal(looksLikeFabricLabelInput("FR-0226-0024/ 0109-L32"), true);
  });

  it("detects full sticker codes", () => {
    assert.equal(looksLikeFabricLabelInput("GL-0326-0003-SO-2026-0103-L04-SHT-LS"), true);
  });

  it("does not flag employee names", () => {
    assert.equal(looksLikeFabricLabelInput("Ahmed Hassan"), false);
    assert.equal(looksLikeFabricLabelInput("12345"), false);
  });
});

describe("stickerCodesMatch with supplier input", () => {
  const stickerCode = "FR-0226-0024-SO-2026-0109-L32-SHT-LS";
  const clientCode = "FR-0226-0024";

  it("matches supplier pasted label to stored sticker", () => {
    assert.equal(stickerCodesMatch("FR-0226-0024/ 0109-L32", stickerCode, clientCode), true);
  });
});

describe("Suit / multi-piece garment helpers", () => {
  it("orders Suit pieces Jacket then Trouser", () => {
    assert.deepEqual(getGarmentPieces("Suit"), ["Jacket", "Trouser"]);
  });

  it("formats piece under parent with ASCII middle-dot", () => {
    assert.equal(formatLabelGarmentDescription("Suit", "Jacket"), "Suit · Jacket");
    assert.equal(formatLabelGarmentDescription("Suit", "Trouser"), "Suit · Trouser");
    assert.equal(formatLabelGarmentDescription("Jacket", "Jacket"), "Jacket");
  });

  it("formats sticker piece lines for prep and production", () => {
    assert.equal(formatStickerPieceLine("Suit", "Suit", { fabricCut: true }), "Cut · Suit");
    assert.equal(formatStickerPieceLine("Suit", "Jacket"), "Suit · Jacket");
    assert.equal(formatStickerPieceLine("Suit", "Trouser"), "Suit · Trouser");
  });

  it("summarizes Suit with nested pieces for boards", () => {
    assert.equal(formatGarmentWithPieceList("Suit"), "Suit (Jacket + Trouser)");
    assert.equal(formatGarmentWithPieceList("Shirt+Trouser"), "Shirt + Trouser");
  });

  it("reads ordered pieces from fabric-line stickers even when sequence is shuffled", () => {
    const pieces = piecesForFabricLine({
      garment_type: "Suit",
      label_stickers: [
        { piece_name: "Trouser", sequence: 2 },
        { piece_name: "Jacket", sequence: 1 },
      ],
    });
    assert.deepEqual(pieces, ["Jacket", "Trouser"]);
  });

  it("falls back to garment map for pattern jobs without piece_names", () => {
    assert.deepEqual(
      piecesForPatternJob({ garment_type: "Suit", piece_name: "Jacket" }),
      ["Jacket", "Trouser"]
    );
  });
});
