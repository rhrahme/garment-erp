import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fabricCutStickerForFabricLine,
  manufacturingStickersForFabricLine,
  manufacturingStickersForJob,
  pieceStickersForFabricLine,
} from "./manufacturing-stickers.ts";
import type { SalesOrder, SalesOrderFabricLine } from "../types/sales-orders.ts";

function suitLine(id: string): SalesOrderFabricLine {
  return {
    id,
    fabric_number: "S14036",
    supplier_id: "loro-piana",
    supplier_name: "Solbiati",
    garment_type: "Suit",
    quantity: 3,
    unit: "meters",
    label_count: 2,
    composition: null,
    weight_gsm: 340,
    width_cm: 148,
    width_inches: null,
    color: null,
    label_stickers: [
      {
        code: "FR-0126-0019-SO-2026-0132-L04-JKT",
        piece_name: "Jacket",
        sequence: 1,
      },
      {
        code: "FR-0126-0019-SO-2026-0132-L04-TR",
        piece_name: "Trouser",
        sequence: 2,
      },
    ],
  } as SalesOrderFabricLine;
}

function trouserLine(id: string): SalesOrderFabricLine {
  return {
    ...suitLine(id),
    garment_type: "Trouser",
    label_count: 1,
    label_stickers: [
      {
        code: "FR-0126-0019-SO-2026-0132-L05-TR",
        piece_name: "Trouser",
        sequence: 1,
      },
    ],
  } as SalesOrderFabricLine;
}

describe("manufacturingStickersForJob", () => {
  it("returns fabric-cut prep plus Jacket/Trouser piece QRs for Suit", () => {
    const line = suitLine("line-suit");
    const order = {
      id: "so-1",
      client_code: "FR-0126-0019",
      fabric_lines: [line],
    } as SalesOrder;

    const stickers = manufacturingStickersForJob(
      { sales_order_id: "so-1", sales_order_line_id: "line-suit" },
      order
    );

    assert.deepEqual(
      stickers.map((s) => s.qr_payload),
      ["FR-0132-L04", "FR-0132-L04-JKT", "FR-0132-L04-TR"]
    );
    assert.deepEqual(
      stickers.map((s) => s.role),
      ["prep", "piece", "piece"]
    );
    assert.deepEqual(
      stickers.map((s) => s.piece_name),
      ["Fabric cut", "Jacket", "Trouser"]
    );
  });

  it("returns one piece QR for single-piece Trouser", () => {
    const line = trouserLine("line-tr");
    const order = {
      id: "so-1",
      client_code: "FR-0126-0019",
      fabric_lines: [line],
    } as SalesOrder;

    const stickers = manufacturingStickersForJob(
      { sales_order_id: "so-1", sales_order_line_id: "line-tr" },
      order
    );

    assert.equal(stickers.length, 1);
    assert.equal(stickers[0]?.qr_payload, "FR-0132-L05-TR");
    assert.equal(stickers[0]?.role, "piece");
  });

  it("matches sticker print piece encoding helpers", () => {
    const line = suitLine("line-suit");
    const pieces = pieceStickersForFabricLine(line, "FR-0126-0019");
    const prep = fabricCutStickerForFabricLine(line, "FR-0126-0019");

    assert.equal(prep?.qr_payload, "FR-0132-L04");
    assert.equal(pieces[0]?.qr_payload, "FR-0132-L04-JKT");
    assert.equal(pieces[1]?.qr_payload, "FR-0132-L04-TR");
  });

  it("manufacturingStickersForFabricLine matches job helper for Suit", () => {
    const line = suitLine("line-suit");
    const stickers = manufacturingStickersForFabricLine(line, "FR-0126-0019");
    assert.deepEqual(
      stickers.map((s) => s.qr_payload),
      ["FR-0132-L04", "FR-0132-L04-JKT", "FR-0132-L04-TR"]
    );
  });
});
