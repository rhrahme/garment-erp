import assert from "node:assert/strict";
import { test } from "node:test";
import {
  itemsForBrandOrSearch,
  patternQueueEmptyCopy,
  searchLooksAcrossBrands,
} from "./search-across-brands.ts";

test("typing a client name searches every brand", () => {
  assert.equal(searchLooksAcrossBrands(""), false);
  assert.equal(searchLooksAcrossBrands("   "), false);
  assert.equal(searchLooksAcrossBrands("---"), false);
  assert.equal(searchLooksAcrossBrands("ibi"), true);
  assert.equal(searchLooksAcrossBrands("grin"), true);
});

test("Gilani-only pool is ignored once they type ibi", () => {
  const all = ["Ibrahim Al Shwemi", "Gilani client"];
  const gilaniOnly = ["Gilani client"];
  assert.deepEqual(itemsForBrandOrSearch(all, gilaniOnly, ""), gilaniOnly);
  assert.deepEqual(itemsForBrandOrSearch(all, gilaniOnly, "ibi"), all);
});

test("empty copy tells them the brand chip hid the list", () => {
  assert.equal(patternQueueEmptyCopy({ search: "", brandSelected: false }), "No sales orders in this tab.");
  assert.match(
    patternQueueEmptyCopy({ search: "", brandSelected: true }),
    /All brands/
  );
  assert.match(patternQueueEmptyCopy({ search: "ibi", brandSelected: true }), /ibi/);
});
