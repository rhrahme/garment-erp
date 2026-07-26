import test from "node:test";
import assert from "node:assert/strict";
import {
  applyDrapersDetailToCatalogFabric,
  applyDrapersMediasToCatalogFabric,
  applyDrapersPriceToCatalogFabric,
  applyDrapersStockToCatalogFabric,
  drapersCatalogDisplayFields,
  findDrapersCatalogFabric,
  indexDrapersCatalogFabrics,
  type DrapersCatalogFabricRow,
} from "./catalog-fields.ts";

test("applyDrapersDetailToCatalogFabric enriches composition, collection, and prices", () => {
  const fabric: DrapersCatalogFabricRow = {
    fabric_number: "10101",
    composition: "100% WV",
    collection: "PE23 - BLAZON",
    mill_name: "VITALE BARBERIS CANONICO S.P.A",
    category: "SEMI CLASSICO",
    mill_code: "413.522/1",
    unit_price: 70,
  };

  applyDrapersDetailToCatalogFabric(
    fabric,
    {
      fabric_code: "10101",
      brand: "Vitale Barberis Canonico",
      bunch: "Blazon Super 150's",
      fibres: "Wool",
      list_price: "73,20",
      actual_price: "71,00",
      is_available: true,
    },
    "2026-07-26T12:00:00.000Z"
  );

  assert.equal(fabric.api_brand, "Vitale Barberis Canonico");
  assert.equal(fabric.api_bunch, "Blazon Super 150's");
  assert.equal(fabric.composition, "Wool");
  assert.equal(fabric.collection, "Blazon Super 150's");
  assert.equal(fabric.unit_price, 71);
  assert.equal(fabric.list_price, 73.2);

  const display = drapersCatalogDisplayFields(fabric);
  assert.equal(display.composition, "Wool");
  assert.equal(display.collection, "Blazon Super 150's");
  assert.equal(display.mill_name, "Vitale Barberis Canonico");
});

test("applyDrapersStockToCatalogFabric maps warehouse meters", () => {
  const fabric: DrapersCatalogFabricRow = { fabric_number: "10101" };
  applyDrapersStockToCatalogFabric(
    fabric,
    {
      fabric_code: "10101",
      quantity: "41,25",
      in_stock: true,
      in_restock: false,
      restock_date: null,
    },
    "2026-07-26T12:00:00.000Z"
  );

  assert.equal(fabric.stock_status, "in_stock");
  assert.equal(fabric.disponibilita_meters, 41.25);
});

test("applyDrapersMediasToCatalogFabric stores swatch URLs", () => {
  const fabric: DrapersCatalogFabricRow = { fabric_number: "10101" };
  applyDrapersMediasToCatalogFabric(
    fabric,
    {
      square: "https://example.com/square.jpg",
      zoom: "https://example.com/zoom.jpg",
      ruler: "https://example.com/ruler.jpg",
    },
    "2026-07-26T12:00:00.000Z"
  );

  const display = drapersCatalogDisplayFields(fabric);
  assert.equal(display.swatch_square, "https://example.com/square.jpg");
  assert.equal(display.swatch_zoom, "https://example.com/zoom.jpg");
});

test("findDrapersCatalogFabric resolves DP prefix", () => {
  const map = indexDrapersCatalogFabrics([{ fabric_number: "10101" }]);
  assert.ok(findDrapersCatalogFabric(map, "DP10101"));
});

test("drapersCatalogDisplayFields prefers local swatch over remote URL", () => {
  const fabric: DrapersCatalogFabricRow = {
    fabric_number: "10101",
    swatch_filename: "10101.jpg",
    swatch_square: "https://example.com/remote.jpg",
  };
  const display = drapersCatalogDisplayFields(fabric);
  assert.match(display.swatch_square ?? "", /^\/api\/suppliers\/drapers\/images\//);
  assert.equal(display.swatch_filename, "10101.jpg");
});
