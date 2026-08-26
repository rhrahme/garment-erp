import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesLooseName } from "./name-search.ts";

test("ibi finds Ibrahim even though Ibrahim has no ibi substring", () => {
  assert.equal(matchesLooseName("Ibrahim Al Shwemi", "ibi"), true);
  assert.equal(matchesLooseName("Ibrahim Al Shwemi", "ibr"), true);
  assert.equal(matchesLooseName("Ibrahim Al Shwemi", "ibrahim"), true);
  assert.equal(matchesLooseName("Ibrahim Al Shwemi", "shwemi"), true);
});

test("loose name does not match an unrelated client", () => {
  assert.equal(matchesLooseName("Blair Maxwell", "ibi"), false);
  assert.equal(matchesLooseName("Gilani client", "ibi"), false);
});
