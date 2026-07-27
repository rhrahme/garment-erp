import assert from "node:assert/strict";
import test from "node:test";
import { formatFabricStockLabel, formatSalesOrderLineStock } from "./fabric-stock.ts";
import { formatRestockDate, parseFlexibleDate } from "@/lib/utils";

test("parseFlexibleDate handles Unix seconds", () => {
  const date = parseFlexibleDate(1781222400);
  assert.equal(date?.toISOString(), "2026-06-12T00:00:00.000Z");
});

test("parseFlexibleDate handles Unix milliseconds", () => {
  const date = parseFlexibleDate(1781222400000);
  assert.equal(date?.toISOString(), "2026-06-12T00:00:00.000Z");
});

test("parseFlexibleDate handles ISO date strings", () => {
  const date = parseFlexibleDate("2026-06-03");
  assert.equal(date?.toISOString().slice(0, 10), "2026-06-03");
});

test("formatRestockDate renders human-readable dates", () => {
  assert.equal(formatRestockDate(1781222400), "12 Jun 2026");
  assert.equal(formatRestockDate("2026-06-03"), "03 Jun 2026");
});

test("formatFabricStockLabel formats temp unavailable restock dates", () => {
  assert.equal(
    formatFabricStockLabel({ stock_status: "temp_unavailable", restock_date: 1781222400 }),
    "Out until 12 Jun 2026"
  );
});

test("formatSalesOrderLineStock prefers replacement messaging", () => {
  assert.equal(
    formatSalesOrderLineStock({
      stock_status: "temp_unavailable",
      restock_date: 1781222400,
      needs_replacement: true,
      replacement_fabric_number: "12345",
    }),
    "Replace with 12345"
  );
});
