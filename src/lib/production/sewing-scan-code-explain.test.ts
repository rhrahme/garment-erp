import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  explainUnrecognizedStitchScan,
  fabricCutWashRejectMessage,
  isFabricCutOnlyStitchScan,
  looksLikeFabricCutWashCode,
  looksLikeProductionPieceCode,
  scanMatchesFabricCutCode,
  scanMatchesPieceProductionCode,
} from "./sewing-scan-code-explain.ts";

describe("looksLikeFabricCutWashCode", () => {
  it("detects shorthand fabric-cut / wash codes", () => {
    assert.equal(looksLikeFabricCutWashCode("FR-0109-L32"), true);
    assert.equal(looksLikeFabricCutWashCode("FR-0526-0101-L05"), true);
  });

  it("detects supplier prep label format", () => {
    assert.equal(looksLikeFabricCutWashCode("FR-0226-0024/ 0109-L32"), true);
  });

  it("does not flag production piece codes", () => {
    assert.equal(looksLikeFabricCutWashCode("FR-0132-L07-JKT-1/2"), false);
    assert.equal(looksLikeFabricCutWashCode("FR-0002-L33-SH"), false);
  });
});

describe("looksLikeProductionPieceCode", () => {
  it("detects piece QR shapes", () => {
    assert.equal(looksLikeProductionPieceCode("FR-0132-L07-JKT-1/2"), true);
    assert.equal(looksLikeProductionPieceCode("GL-0326-0003-SO-2026-0103-L04-SHT-LS"), true);
  });

  it("does not flag fabric-cut wash codes", () => {
    assert.equal(looksLikeProductionPieceCode("FR-0109-L32"), false);
  });
});

describe("isFabricCutOnlyStitchScan", () => {
  const clientCode = "FR-0126-0019";
  const stickers = [
    {
      code: "FR-0126-0019-SO-2026-0132-L07-JKT-1/2",
      piece_name: "Jacket",
      sequence: 1,
    },
    {
      code: "FR-0126-0019-SO-2026-0132-L07-TR-2/2",
      piece_name: "Trouser",
      sequence: 2,
    },
  ];
  const fabricCutCode = "FR-0132-L07";

  it("rejects wash / fabric-cut QR even when the line resolves", () => {
    assert.equal(
      isFabricCutOnlyStitchScan("FR-0132-L07", {
        fabric_cut_code: fabricCutCode,
        client_code: clientCode,
        stickers,
      }),
      true
    );
    assert.equal(scanMatchesFabricCutCode("FR-0132-L07", fabricCutCode), true);
    assert.equal(
      scanMatchesPieceProductionCode("FR-0132-L07", stickers[0]!, clientCode, stickers),
      false
    );
  });

  it("allows production A4 piece QR", () => {
    assert.equal(
      isFabricCutOnlyStitchScan("FR-0132-L07-JKT-1/2", {
        fabric_cut_code: fabricCutCode,
        client_code: clientCode,
        stickers,
      }),
      false
    );
  });
});

describe("explainUnrecognizedStitchScan", () => {
  it("explains washing / fabric-cut codes", () => {
    const msg = explainUnrecognizedStitchScan("FR-0109-L32");
    assert.match(msg, /fabric-cut \/ washing QR/i);
    assert.match(msg, /production A4 piece QR/i);
    assert.match(msg, /FR-0109-L32/);
  });

  it("explains supplier prep labels as washing codes", () => {
    const msg = explainUnrecognizedStitchScan("FR-0226-0024/ 0109-L32");
    assert.match(msg, /fabric-cut \/ washing QR/i);
  });

  it("explains malformed EMP badges", () => {
    const msg = explainUnrecognizedStitchScan("EMP-001");
    assert.match(msg, /Malformed employee badge/i);
    assert.match(msg, /EMP:\{id\}/);
  });

  it("explains shipping AWB barcodes", () => {
    const msg = explainUnrecognizedStitchScan("1234567890");
    assert.match(msg, /shipping AWB/i);
    assert.match(msg, /production A4 piece QR/i);
  });

  it("explains workstation placard QRs", () => {
    const msg = explainUnrecognizedStitchScan("PL-1-1");
    assert.match(msg, /workstation placard/i);
    assert.match(msg, /production A4 piece QR/i);
  });

  it("explains unknown piece-shaped codes without mentioning wash", () => {
    const msg = explainUnrecognizedStitchScan("FR-9999-L01-JKT-1/2");
    assert.match(msg, /Production piece code not found/i);
    assert.match(msg, /FR-9999-L01-JKT-1\/2/);
    assert.match(msg, /production \/ stitcher A4/i);
    assert.doesNotMatch(msg, /wash/i);
    assert.doesNotMatch(msg, /prep/i);
  });

  it("gives a clear generic fallback with expected formats", () => {
    const msg = explainUnrecognizedStitchScan("ZZZ-NOT-A-PIECE");
    assert.match(msg, /Code not recognized: ZZZ-NOT-A-PIECE/);
    assert.match(msg, /EMP \/ EMPALT \/ EMPIRON \/ EMPBTN/);
    assert.match(msg, /production A4 piece QR/i);
  });
});

describe("fabricCutWashRejectMessage", () => {
  it("names the cut code and points to A4 piece QR", () => {
    const msg = fabricCutWashRejectMessage("FR-0132-L07", "FR-0132-L07");
    assert.match(msg, /FR-0132-L07/);
    assert.match(msg, /receive & wash/i);
    assert.match(msg, /production A4 piece QR/i);
  });
});
