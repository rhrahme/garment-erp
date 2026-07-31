import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expandFabricLabelScanInput,
  formatGarmentWithPieceList,
  formatLabelGarmentDescription,
  formatStickerPieceLine,
  generateFabricLabelStickers,
  getGarmentPieces,
  looksLikeFabricLabelInput,
  pieceProductionCodeFromSticker,
  pieceScanAttribution,
  piecesForFabricLine,
  piecesForPatternJob,
  stickerCodesMatch,
  stripPieceIndexMark,
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

describe("piece index marks (n/N)", () => {
  const clientCode = "FR-0126-0019";
  const clientRef = "FR-0126-0019-SO-2026-0132";

  it("generates Suit stickers with 1/2 and 2/2", () => {
    const stickers = generateFabricLabelStickers(clientRef, 7, "Suit");
    assert.equal(stickers[0]!.code, `${clientRef}-L07-JKT-1/2`);
    assert.equal(stickers[1]!.code, `${clientRef}-L07-TR-2/2`);
  });

  it("generates Suit+Vest stickers Jacket / Vest / Trouser as 1/3 2/3 3/3", () => {
    assert.deepEqual(getGarmentPieces("Suit+Vest"), ["Jacket", "Vest", "Trouser"]);
    const stickers = generateFabricLabelStickers(clientRef, 7, "Suit+Vest");
    assert.equal(stickers[0]!.code, `${clientRef}-L07-JKT-1/3`);
    assert.equal(stickers[1]!.code, `${clientRef}-L07-VST-2/3`);
    assert.equal(stickers[2]!.code, `${clientRef}-L07-TR-3/3`);
  });

  it("builds production codes FR-0132-L07-JKT-1/2 from new and legacy stickers", () => {
    const newStickers = generateFabricLabelStickers(clientRef, 7, "Suit");
    assert.equal(
      pieceProductionCodeFromSticker(newStickers[0]!, clientCode, newStickers),
      "FR-0132-L07-JKT-1/2"
    );
    assert.equal(
      pieceProductionCodeFromSticker(newStickers[1]!, clientCode, newStickers),
      "FR-0132-L07-TR-2/2"
    );

    const legacy = [
      { code: `${clientRef}-L07-JKT`, piece_name: "Jacket", sequence: 1 },
      { code: `${clientRef}-L07-TR`, piece_name: "Trouser", sequence: 2 },
    ];
    assert.equal(pieceProductionCodeFromSticker(legacy[0]!, clientCode, legacy), "FR-0132-L07-JKT-1/2");
    assert.equal(pieceProductionCodeFromSticker(legacy[1]!, clientCode, legacy), "FR-0132-L07-TR-2/2");
  });

  it("dual-accepts old piece scans without -n/N", () => {
    const stickerCode = `${clientRef}-L07-JKT-1/2`;
    assert.equal(stickerCodesMatch("FR-0132-L07-JKT-1/2", stickerCode, clientCode), true);
    assert.equal(stickerCodesMatch("FR-0132-L07-JKT", stickerCode, clientCode), true);
    assert.equal(stickerCodesMatch(`${clientRef}-L07-JKT`, stickerCode, clientCode), true);
    assert.equal(stickerCodesMatch("FR-0132-L07-TR-2/2", stickerCode, clientCode), false);
  });

  it("attributes piece mark JKT-1/2 for scan history", () => {
    const stickers = generateFabricLabelStickers(clientRef, 7, "Suit");
    const attr = pieceScanAttribution(stickers[0]!, clientCode, stickers);
    assert.equal(attr.piece_abbrev, "JKT");
    assert.equal(attr.piece_index, 1);
    assert.equal(attr.piece_total, 2);
    assert.equal(attr.piece_mark, "JKT-1/2");
    assert.equal(stripPieceIndexMark("FR-0132-L07-JKT-1/2"), "FR-0132-L07-JKT");
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
