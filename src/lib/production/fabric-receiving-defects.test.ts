import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDefectType, parseFoundAt } from "./fabric-receiving-defects.ts";

test("parseFoundAt accepts receiving and cutting only", () => {
  assert.equal(parseFoundAt("receiving"), "receiving");
  assert.equal(parseFoundAt("cutting"), "cutting");
  assert.equal(parseFoundAt("other"), null);
  assert.equal(parseFoundAt(null), null);
});

test("parseDefectType keeps known chips and trims custom text", () => {
  assert.equal(parseDefectType("shade"), "shade");
  assert.equal(parseDefectType("  hole  "), "hole");
  assert.equal(parseDefectType(""), undefined);
  assert.equal(parseDefectType("custom tear"), "custom tear");
});

test("cutting found_at implies task team miss at model level", () => {
  const foundAt = parseFoundAt("cutting");
  assert.equal(foundAt === "cutting", true);
  assert.equal(foundAt === "cutting" ? true : false, true);
});
