import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesNormalizedSearch, normalizeSearchText } from "./normalize.ts";

test("normalizeSearchText strips separators and lowercases", () => {
  assert.equal(normalizeSearchText("FR-0726-0039"), "fr07260039");
  assert.equal(normalizeSearchText("fr 0726 0039"), "fr07260039");
  assert.equal(normalizeSearchText("FR-07260039"), "fr07260039");
  assert.equal(normalizeSearchText("SO-2026-0121"), "so20260121");
  assert.equal(normalizeSearchText("0119-L01"), "0119l01");
  assert.equal(normalizeSearchText(null), "");
  assert.equal(normalizeSearchText(""), "");
});

test("FR code matches regardless of dashes/spaces/case", () => {
  const fields = ["FR-0726-0039"];
  for (const query of ["FR-07260039", "fr 0726 0039", "FR-0726-0039", "07260039", "0726-0039", "fr07260039"]) {
    assert.ok(matchesNormalizedSearch(fields, query), `expected "${query}" to match FR-0726-0039`);
  }
});

test("SO number matches across formats", () => {
  const fields = ["SO-2026-0121"];
  for (const query of ["SO-2026-0121", "SO20260121", "so 2026 0121", "20260121", "0121"]) {
    assert.ok(matchesNormalizedSearch(fields, query), `expected "${query}" to match SO-2026-0121`);
  }
});

test("sticker/line codes and client names still match partially", () => {
  assert.ok(matchesNormalizedSearch(["0119-L01"], "0119l01"));
  assert.ok(matchesNormalizedSearch(["0119-L01"], "L01"));
  assert.ok(matchesNormalizedSearch(["Acme Tailors"], "acme"));
  assert.ok(matchesNormalizedSearch(["Acme Tailors"], "acmetailors"));
});

test("empty or separator-only query matches everything", () => {
  assert.ok(matchesNormalizedSearch(["FR-0726-0039"], ""));
  assert.ok(matchesNormalizedSearch(["FR-0726-0039"], "   "));
  assert.ok(matchesNormalizedSearch(["FR-0726-0039"], "---"));
});

test("non-matching query still returns false", () => {
  assert.equal(matchesNormalizedSearch(["FR-0726-0039"], "9999"), false);
  assert.equal(matchesNormalizedSearch(["Acme Tailors"], "zzz"), false);
});
