import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Mirrors FabricSpecView showPrices gate.
 * Regression: `canViewPrices && (!hydrated || visible)` ignored lock clicks
 * while hydrated was false, and made the shared password toggle easy to miswire.
 */
function fabricSpecShowPrices(canViewPrices: boolean, pricesVisible: boolean): boolean {
  return Boolean(canViewPrices && pricesVisible);
}

describe("fabric spec eye toggle showPrices", () => {
  it("admin default hidden until reveal", () => {
    assert.equal(fabricSpecShowPrices(true, false), false);
  });

  it("admin reveal shows prices", () => {
    assert.equal(fabricSpecShowPrices(true, true), true);
  });

  it("admin lock hides prices", () => {
    assert.equal(fabricSpecShowPrices(true, false), false);
  });

  it("sales never sees prices even if visible flag is true", () => {
    assert.equal(fabricSpecShowPrices(false, true), false);
  });
});
