import assert from "node:assert/strict";
import { test } from "node:test";
import { salesOrderMatchesSearch } from "./list-search.ts";

const ajlanSearchText =
  "so-2026-0008 fr-0426-0006 abdel aziz fahd al ajlan fr-0426-0006-so-2026-0008 open";

test("sales order search matches FR codes across dash/space formats", () => {
  const row = { search_text: ajlanSearchText };
  for (const query of [
    "FR-0426-0006",
    "FR 0426 0006",
    "FR04260006",
    "fr04260006",
    "0426-0006",
    "04260006",
  ]) {
    assert.ok(
      salesOrderMatchesSearch(row, query),
      `expected "${query}" to match Abdel Aziz order`
    );
  }
});

test("sales order search matches SO numbers across formats", () => {
  const row = { search_text: ajlanSearchText };
  for (const query of ["SO-2026-0008", "SO20260008", "so 2026 0008", "0008"]) {
    assert.ok(
      salesOrderMatchesSearch(row, query),
      `expected "${query}" to match SO-2026-0008`
    );
  }
});

test("sales order search supports multi-token client names", () => {
  const row = { search_text: ajlanSearchText };
  assert.ok(salesOrderMatchesSearch(row, "abdel aziz"));
  assert.ok(salesOrderMatchesSearch(row, "ajlan"));
});

test("sales order search rejects unrelated queries", () => {
  const row = { search_text: ajlanSearchText };
  assert.equal(salesOrderMatchesSearch(row, "FR-9999-9999"), false);
});
