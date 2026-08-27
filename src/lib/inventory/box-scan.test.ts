import assert from "node:assert/strict";
import { test } from "node:test";
import { parseInventoryBoxScan, resolveBoxQuantities } from "./box-scan.ts";

test("box QR URL and raw id both resolve to the carton id", () => {
  assert.equal(
    parseInventoryBoxScan("https://erp.hagan.pro/inventory/cartons/ctn-abc123"),
    "ctn-abc123"
  );
  assert.equal(parseInventoryBoxScan("/inventory/cartons/ctn-abc123"), "ctn-abc123");
  assert.equal(parseInventoryBoxScan("ctn-abc123"), "ctn-abc123");
});

test("each box can have its own count inside", () => {
  assert.deepEqual(resolveBoxQuantities(3, 200), [200, 200, 200]);
  assert.deepEqual(resolveBoxQuantities(0, 0, [50, 48, 52]), [50, 48, 52]);
});

test("empty or zero inside a box is rejected", () => {
  assert.throws(() => resolveBoxQuantities(2, 0), /inside each box/);
  assert.throws(() => resolveBoxQuantities(1, 10, [10, 0]), /inside each box/);
});
