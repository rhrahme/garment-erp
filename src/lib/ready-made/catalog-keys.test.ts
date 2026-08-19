import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultReadyMadeSizes,
  normalizeReadyMadeSize,
  readyMadeGarmentId,
} from "@/lib/ready-made/catalog-keys";

describe("ready-made catalog keys", () => {
  it("builds a stable garment id from brand, article, and type", () => {
    assert.equal(
      readyMadeGarmentId("massimo-dutti", "Linen Short", "Short"),
      readyMadeGarmentId("Massimo-Dutti", "linen short", "short")
    );
  });

  it("normalizes size labels", () => {
    assert.equal(normalizeReadyMadeSize(" xl "), "XL");
    assert.equal(normalizeReadyMadeSize("50"), "50");
  });

  it("starts with the standard size run", () => {
    assert.deepEqual(defaultReadyMadeSizes(), ["XS", "S", "M", "L", "XL", "XXL"]);
  });
});
