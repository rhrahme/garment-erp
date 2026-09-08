import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  costHintNamedClientsQuery,
  matchesCostHintClientFilter,
  parseCostHintClientTokens,
  resolveCostHintNamedClient,
} from "@/lib/costing/cost-hint-clients";

describe("cost hint named clients", () => {
  it("resolves the offline-pricing names including Pr Khaled", () => {
    assert.equal(resolveCostHintNamedClient("ibrahim")?.codes[0], "FR-0726-0037");
    assert.equal(resolveCostHintNamedClient("mitwalli")?.key, "mitwalli");
    assert.equal(resolveCostHintNamedClient("hicham")?.key, "hicham");
    assert.equal(resolveCostHintNamedClient("al sheikh mohamad")?.key, "mohammad-al-sheikh");
    assert.equal(resolveCostHintNamedClient("khaled")?.codes[0], "FR-0626-0037");
    assert.equal(parseCostHintClientTokens(costHintNamedClientsQuery()).length, 5);
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
    assert.equal(
      matchesCostHintClientFilter("Pr Khaled Bin Salman", "FR-0626-0037", ["khaled"]),
      true
    );
    assert.equal(
      matchesCostHintClientFilter("Khaled Al Moussa", "FR-0426-0007", ["khaled"]),
      false
    );
  });
});
