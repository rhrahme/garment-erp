import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatBasePatternDisplayName,
  formatTudSizeDerivedLine,
} from "./derived-from.ts";

test("formatBasePatternDisplayName joins house brand, family, garment, and variant", () => {
  assert.equal(
    formatBasePatternDisplayName({
      house_brand_code: "FR",
      cut_family: "Suit Supply",
      garment_type: "shirt",
      cut_variant: "Regular",
    }),
    "FR · Suit Supply · Shirt · Regular"
  );
});

test("formatBasePatternDisplayName returns null when base is missing", () => {
  assert.equal(formatBasePatternDisplayName(null), null);
});

test("formatTudSizeDerivedLine pairs a single size with the base name", () => {
  assert.equal(
    formatTudSizeDerivedLine(["2XL"], "FR · Massimo · Shorts"),
    "Size 2XL · from FR · Massimo · Shorts"
  );
});

test("formatTudSizeDerivedLine shows Custom when unlinked", () => {
  assert.equal(formatTudSizeDerivedLine(["2XL"], null), "Size 2XL · Custom");
  assert.equal(formatTudSizeDerivedLine([], null), "Custom");
});
