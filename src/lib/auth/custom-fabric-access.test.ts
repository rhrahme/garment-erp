import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canCreateCustomFabric } from "./custom-fabric-access.ts";

function session(
  flags: Partial<Parameters<typeof canCreateCustomFabric>[0]>
): Parameters<typeof canCreateCustomFabric>[0] {
  return {
    isSalesOperator: false,
    isAdmin: false,
    isClientManager: false,
    isTaskOperator: false,
    isProductionOperator: false,
    isPatternOperator: false,
    ...flags,
  };
}

describe("canCreateCustomFabric", () => {
  it("blocks sales", () => {
    assert.equal(canCreateCustomFabric(session({ isSalesOperator: true })), false);
  });

  it("allows admin, QC, task, production, and pattern", () => {
    assert.equal(canCreateCustomFabric(session({ isAdmin: true })), true);
    assert.equal(canCreateCustomFabric(session({ isClientManager: true })), true);
    assert.equal(canCreateCustomFabric(session({ isTaskOperator: true })), true);
    assert.equal(canCreateCustomFabric(session({ isProductionOperator: true })), true);
    assert.equal(canCreateCustomFabric(session({ isPatternOperator: true })), true);
  });

  it("denies unrelated roles", () => {
    assert.equal(canCreateCustomFabric(session({})), false);
  });
});
