import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nestMapHeight, nestMapTransform } from "./nest-map-transform.ts";

describe("nestMapTransform", () => {
  it("uses uniform scale so DXF outlines are not squashed by a short map", () => {
    // Youssef shorts nest: ~79.6cm packed x 74cm usable on a wide, short A4 map.
    const lengthCm = 79.6;
    const usableW = 74;
    const mapW = 182;
    const mapH = 36;
    const t = nestMapTransform(lengthCm, usableW, mapW, mapH);

    assert.ok(t.scale > 0);
    // Content must fit inside the map.
    assert.ok(t.contentW <= mapW + 1e-9);
    assert.ok(t.contentH <= mapH + 1e-9);
    // Uniform: a 1cm square in fabric space stays square on the page.
    assert.ok(
      Math.abs(t.scale - Math.min(mapW / lengthCm, mapH / usableW)) < 1e-12
    );
    // Old bug: scaleX=mapW/L and scaleY=mapH/W differed by ~4.7x for this nest.
    const oldRatio = mapW / lengthCm / (mapH / usableW);
    assert.ok(oldRatio > 4, `expected old non-uniform ratio > 4, got ${oldRatio}`);
    assert.ok(
      Math.abs(t.contentW / lengthCm - t.contentH / usableW) < 1e-12,
      "uniform scale must keep fabric cm square on the page"
    );
  });

  it("centers letterboxed content when aspect ratios differ", () => {
    const t = nestMapTransform(100, 50, 200, 200);
    assert.equal(t.scale, 2);
    assert.equal(t.contentW, 200);
    assert.equal(t.contentH, 100);
    assert.equal(t.offsetX, 0);
    assert.equal(t.offsetY, 50);
  });
});

describe("nestMapHeight", () => {
  it("allows a taller map when DXF outlines are present", () => {
    const mapW = 182;
    const tudH = nestMapHeight(mapW, 80, 74, { hasDxfOutlines: false });
    const dxfH = nestMapHeight(mapW, 80, 74, { hasDxfOutlines: true });
    assert.equal(tudH, 36);
    assert.equal(dxfH, 58);
  });
});
