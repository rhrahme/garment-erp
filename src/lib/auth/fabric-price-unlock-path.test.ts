import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  encodeFabricPriceUnlockCookie,
  fabricPriceUnlockMatchesPath,
  normalizePriceUnlockPath,
  parseFabricPriceUnlockPath,
} from "./fabric-price-unlock-path.ts";

describe("fabric price unlock path scope", () => {
  it("normalizes trailing slashes and strips query/hash", () => {
    assert.equal(normalizePriceUnlockPath("/orders/abc/"), "/orders/abc");
    assert.equal(normalizePriceUnlockPath("/orders/abc?x=1#y"), "/orders/abc");
    assert.equal(normalizePriceUnlockPath("orders/abc"), null);
  });

  it("encodes and parses path-scoped cookies", () => {
    assert.equal(encodeFabricPriceUnlockCookie("/orders/abc"), "1:/orders/abc");
    assert.equal(parseFabricPriceUnlockPath("1:/orders/abc"), "/orders/abc");
    assert.equal(parseFabricPriceUnlockPath("1"), null);
    assert.equal(parseFabricPriceUnlockPath("1:"), null);
  });

  it("matches only the unlocked page path", () => {
    assert.equal(fabricPriceUnlockMatchesPath("1:/orders/a", "/orders/a"), true);
    assert.equal(fabricPriceUnlockMatchesPath("1:/orders/a", "/orders/b"), false);
    assert.equal(fabricPriceUnlockMatchesPath("1", "/orders/a"), false);
    assert.equal(fabricPriceUnlockMatchesPath("1:/orders/a", null), false);
  });
});
