import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  costHintNamedClientsQuery,
  matchesCostHintClientFilter,
  parseCostHintClientTokens,
  resolveCostHintNamedClient,
} from "@/lib/costing/cost-hint-clients";

describe("cost hint named clients", () => {
  it("resolves the four offline-pricing names", () => {
    assert.equal(resolveCostHintNamedClient("ibrahim")?.codes[0], "FR-0726-0037");
    assert.equal(resolveCostHintNamedClient("mitwalli")?.key, "mitwalli");
    assert.equal(resolveCostHintNamedClient("hicham")?.key, "hicham");
    assert.equal(resolveCostHintNamedClient("al sheikh mohamad")?.key, "mohammad-al-sheikh");
    assert.equal(parseCostHintClientTokens(costHintNamedClientsQuery()).length, 4);
  });

  it("does not treat other Sheikhs or Ibrahims as Mohammad Al Sheikh", () => {
    assert.equal(
      matchesCostHintClientFilter("Abdulillah Abdulmohsen Al Sheikh", "FR-0726-0001", ["mohammad-al-sheikh"]),
      false
    );
    assert.equal(
      matchesCostHintClientFilter("Sheikh Mohamad Al Ajlan", "FR-0726-0010", ["mohammad-al-sheikh"]),
      false
    );
    assert.equal(
      matchesCostHintClientFilter("Mohammad Al Sheikh", "FR-0726-0047", ["mohammad-al-sheikh"]),
      true
    );
    assert.equal(matchesCostHintClientFilter("Ibrahim Al Shwemi", "FR-0726-0037", ["ibrahim"]), true);
    assert.equal(matchesCostHintClientFilter("Ibrahim Other", "FR-0726-0999", ["ibrahim"]), false);
  });
});
