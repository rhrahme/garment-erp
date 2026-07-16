import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateCustomFabricId,
  generateCustomFabricNumber,
  validateCreateCustomFabricInput,
} from "./custom-fabric-number.ts";

describe("generateCustomFabricNumber", () => {
  it("starts at CF-{year}-0001 when empty", () => {
    assert.equal(generateCustomFabricNumber([], new Date("2026-07-16T12:00:00Z")), "CF-2026-0001");
  });

  it("increments within the current year", () => {
    const fabrics = [
      { fabric_number: "CF-2026-0001" },
      { fabric_number: "CF-2026-0003" },
      { fabric_number: "CF-2025-0099" },
    ];
    assert.equal(generateCustomFabricNumber(fabrics, new Date("2026-07-16T12:00:00Z")), "CF-2026-0004");
  });

  it("ignores non-CF numbers", () => {
    const fabrics = [{ fabric_number: "LP12345" }, { fabric_number: "manual-xyz" }];
    assert.equal(generateCustomFabricNumber(fabrics, new Date("2026-01-01T00:00:00Z")), "CF-2026-0001");
  });
});

describe("validateCreateCustomFabricInput", () => {
  it("requires description", () => {
    const result = validateCreateCustomFabricInput({ description: "  " });
    assert.equal(result.ok, false);
  });

  it("accepts recommended fields and defaults currency when priced", () => {
    const result = validateCreateCustomFabricInput({
      description: "Navy leftover",
      color: "Navy",
      composition: "100% Wool",
      unit_price: 42.5,
      source_note: "Mill visit",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.description, "Navy leftover");
      assert.equal(result.data.currency, "EUR");
      assert.equal(result.data.unit_price, 42.5);
    }
  });

  it("builds stable ids from fabric numbers", () => {
    assert.equal(generateCustomFabricId("CF-2026-0001"), "cf-2026-0001");
  });
});
