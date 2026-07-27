import assert from "node:assert/strict";
import test from "node:test";
import {
  effectiveFabricStockStatus,
  formatFabricStockLabel,
  formatSalesOrderLineStock,
  isFabricUnavailable,
} from "./fabric-stock.ts";
import { formatRestockDate, isRestockDatePast, parseFlexibleDate } from "@/lib/utils";

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

test("isRestockDatePast detects expired restock promises", () => {
  const now = new Date("2026-07-27T12:00:00.000Z");
  assert.equal(isRestockDatePast(1781222400, now), true);
  assert.equal(isRestockDatePast("2026-08-01", now), false);
});

test("formatFabricStockLabel formats temp unavailable restock dates", () => {
  assert.equal(
    formatFabricStockLabel({ stock_status: "temp_unavailable", restock_date: "2026-12-01" }),
    "Out until 01 Dec 2026"
  );
  assert.equal(
    formatFabricStockLabel({ stock_status: "temp_unavailable", restock_date: 1781222400 }),
    null,
    "past restock date — no misleading Out until label"
  );
});

test("effectiveFabricStockStatus treats past restock as in stock", () => {
  assert.equal(
    effectiveFabricStockStatus({ stock_status: "temp_unavailable", restock_date: 1781222400 }),
    "in_stock"
  );
});

test("isFabricUnavailable ignores temp unavailable when restock date passed", () => {
  assert.equal(isFabricUnavailable("temp_unavailable", 1781222400), false);
  assert.equal(isFabricUnavailable("temp_unavailable", "2026-12-01"), true);
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
