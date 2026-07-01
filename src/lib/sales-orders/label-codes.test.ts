import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expandFabricLabelScanInput,
  looksLikeFabricLabelInput,
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
