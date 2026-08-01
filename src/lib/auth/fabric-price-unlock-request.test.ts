import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldClearFabricPriceUnlockOnRequest } from "./fabric-price-unlock-request.ts";

describe("shouldClearFabricPriceUnlockOnRequest", () => {
  it("clears on full document navigation / refresh", () => {
    assert.equal(
      shouldClearFabricPriceUnlockOnRequest(new Headers({ "sec-fetch-dest": "document" })),
      true
    );
  });

  it("keeps unlock for soft RSC / fetch navigations", () => {
    assert.equal(
      shouldClearFabricPriceUnlockOnRequest(new Headers({ "sec-fetch-dest": "empty" })),
      false
    );
    assert.equal(shouldClearFabricPriceUnlockOnRequest(new Headers()), false);
  });
});
