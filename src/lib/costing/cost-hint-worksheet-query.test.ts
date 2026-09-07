import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { costHintWorksheetQuery, parseCostHintWorksheetSearch } from "@/lib/costing/cost-hint-worksheet-query";

describe("cost hint worksheet query", () => {
  it("builds a sitewide href with no filters", () => {
    assert.equal(costHintWorksheetQuery({}), "");
  });

  it("keeps one sales order and one invoice scoped", () => {
    assert.equal(
      costHintWorksheetQuery({ soNumber: "SO-2026-0117" }),
      "?so=SO-2026-0117"
    );
    assert.equal(
      costHintWorksheetQuery({ invoiceId: "inv-1", brandId: "hagan" }),
      "?invoice=inv-1&brand=hagan"
    );
  });

  it("parses print-page search params", () => {
    assert.deepEqual(
      parseCostHintWorksheetSearch({ so: "SO-2026-0117", archived: "1" }),
      {
        invoiceId: null,
        soNumber: "SO-2026-0117",
        brandId: null,
        includeArchived: true,
      }
    );
  });
});
