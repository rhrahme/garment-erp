import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyFabricLineAssignment,
  buildClientFabricBoard,
  resolveClientFabricStatus,
} from "./client-fabric-board.ts";
import type { ClientPattern } from "@/lib/types/pattern-library";
import type { FabricReceipt } from "@/lib/types/fabric-receipts";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

const CLIENT_CODE = "FR-0526-0027";

function fabricLine(overrides: Partial<SalesOrderFabricLine> & { id: string }): SalesOrderFabricLine {
  return {
    garment_type: "Shirt LS",
    label_count: 1,
    label_stickers: [],
    supplier_id: "drapers",
    supplier_name: "Drapers",
    fabric_number: "889.601",
    quantity: 1.7,
    unit: "m",
    unit_price: 22,
    composition: "100% Linen",
    weight_gsm: 210,
    width_cm: 150,
    width_inches: null,
    color: "White",
    ...overrides,
  };
}

function salesOrder(overrides: Partial<SalesOrder> & { id: string; so_number: string }): SalesOrder {
  return {
    client_id: "client-1",
    client_code: CLIENT_CODE,
    client_name: "Test Client",
    client_reference: null,
    order_date: "2026-05-01",
    delivery_date: null,
    delivery_destination: null,
    status: "open",
    notes: null,
    fabric_lines: [],
    fabric_po_ids: [],
    ...overrides,
  };
}

function receipt(overrides: Partial<FabricReceipt> & { id: string; sales_order_line_id: string }): FabricReceipt {
  return {
    sales_order_id: "so-1",
    so_number: "SO-2026-0122",
    client_id: "client-1",
    client_code: CLIENT_CODE,
    client_name: "Test Client",
    garment_type: "Shirt LS",
    fabric_number: "889.601",
    supplier_id: "drapers",
    supplier_name: "Drapers",
    fabric_meters: 1.7,
    composition: "100% Linen",
    weight_gsm: 210,
    status: "received",
    fabric_prep_type: null,
    fabric_prep_step: null,
    received_at: "2026-05-05T08:00:00Z",
    updated_at: "2026-05-05T08:00:00Z",
    handed_off_at: null,
    ...overrides,
  };
}

function clientPattern(
  overrides: Partial<ClientPattern> & { id: string; pattern_ref: string }
): ClientPattern {
  return {
    client_id: "client-1",
    client_code: CLIENT_CODE,
    client_name: "Test Client",
    garment_type: "shirt",
    description: null,
    base_pattern_id: null,
    base_size: null,
    house_brand_id: null,
    house_brand_code: null,
    fabric: null,
    unit: "in",
    versions: [],
    final_version_id: null,
    special_instructions: null,
    physical_pattern_kept: false,
    physical_pattern_location: null,
    files: [],
    notes: null,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

describe("resolveClientFabricStatus", () => {
  it("maps the receipt lifecycle to board chips", () => {
    assert.equal(resolveClientFabricStatus(null), "on_order");
    assert.equal(resolveClientFabricStatus({ status: "received", fabric_prep_step: null }), "received");
    assert.equal(
      resolveClientFabricStatus({ status: "fabric_prep", fabric_prep_step: "wash" }),
      "washing"
    );
    assert.equal(
      resolveClientFabricStatus({ status: "fabric_prep", fabric_prep_step: "soak" }),
      "washing"
    );
    assert.equal(
      resolveClientFabricStatus({ status: "fabric_prep", fabric_prep_step: "drying" }),
      "drying"
    );
    assert.equal(
      resolveClientFabricStatus({ status: "fabric_prep", fabric_prep_step: "iron" }),
      "ironing"
    );
    assert.equal(resolveClientFabricStatus({ status: "handed_off", fabric_prep_step: null }), "ready");
  });
});

describe("buildClientFabricBoard", () => {
  const orders = [
    salesOrder({
      id: "so-1",
      so_number: "SO-2026-0122",
      fabric_lines: [
        fabricLine({
          id: "line-1",
          label_stickers: [
            { code: `${CLIENT_CODE}-SO-2026-0122-L06-SHT-LS`, piece_name: "Shirt LS", sequence: 1 },
          ],
        }),
        fabricLine({ id: "line-2", garment_type: "Polo", fabric_number: "512.114" }),
      ],
    }),
    salesOrder({
      id: "so-2",
      so_number: "SO-2026-0089",
      order_date: "2026-03-01",
      fabric_lines: [fabricLine({ id: "line-3", garment_type: "Trouser" })],
    }),
    salesOrder({
      id: "so-other-client",
      so_number: "SO-2026-0130",
      client_id: "client-2",
      fabric_lines: [fabricLine({ id: "line-x" })],
    }),
  ];
  const receipts = [
    receipt({ id: "fr-1", sales_order_line_id: "line-1", status: "fabric_prep", fabric_prep_step: "iron" }),
    receipt({
      id: "fr-3",
      sales_order_line_id: "line-3",
      status: "handed_off",
      handed_off_at: "2026-03-10T10:00:00Z",
    }),
  ];
  const patterns = [
    clientPattern({
      id: "cp-1",
      pattern_ref: "FR-SHIRT-LINEN",
      linked_fabric_line_ids: ["line-1"],
    }),
    clientPattern({ id: "cp-other", pattern_ref: "X", client_id: "client-2" }),
  ];

  const board = buildClientFabricBoard({
    clientId: "client-1",
    orders,
    receipts,
    patterns,
  });

  it("lists only this client's fabric lines, newest sales order first", () => {
    assert.deepEqual(
      board.rows.map((row) => row.line_id),
      ["line-1", "line-2", "line-3"]
    );
  });

  it("derives the article code from sticker codes with the brand dropped", () => {
    assert.equal(board.rows[0]!.article_code, "0122-L06");
    // No stickers yet — falls back to SO digits + position.
    assert.equal(board.rows[1]!.article_code, "0122-L02");
  });

  it("maps receipt status and keeps prep timestamps for the history panel", () => {
    assert.equal(board.rows[0]!.status, "ironing");
    assert.equal(board.rows[1]!.status, "on_order");
    assert.equal(board.rows[2]!.status, "ready");
    assert.equal(board.rows[2]!.handed_off_at, "2026-03-10T10:00:00Z");
  });

  it("shows the garment group per fabric and the assigned summary", () => {
    assert.deepEqual(board.rows[0]!.assigned_pattern, {
      pattern_id: "cp-1",
      pattern_ref: "FR-SHIRT-LINEN",
      garment_type: "shirt",
    });
    assert.equal(board.rows[1]!.assigned_pattern, null);
    assert.deepEqual(board.summary, { total: 3, assigned: 1 });
  });

  it("never exposes prices", () => {
    for (const row of board.rows) {
      assert.ok(!("unit_price" in row));
      assert.ok(!JSON.stringify(row).includes("price"));
    }
  });

  it("lists only this client's patterns for the assign dialog", () => {
    assert.deepEqual(
      board.patterns.map((pattern) => pattern.id),
      ["cp-1"]
    );
    assert.equal(board.patterns[0]!.linked_line_count, 1);
  });
});

describe("applyFabricLineAssignment", () => {
  it("adds lines to the target and strips them from the client's other patterns", () => {
    const patterns = [
      clientPattern({ id: "cp-1", pattern_ref: "A", linked_fabric_line_ids: ["line-1", "line-2"] }),
      clientPattern({ id: "cp-2", pattern_ref: "B", linked_fabric_line_ids: ["line-3"] }),
      clientPattern({
        id: "cp-other",
        pattern_ref: "C",
        client_id: "client-2",
        linked_fabric_line_ids: ["line-2"],
      }),
    ];

    const result = applyFabricLineAssignment(patterns, "cp-2", ["line-2", "line-4", "line-4"]);

    assert.deepEqual(result.targetLinkedLineIds, ["line-3", "line-2", "line-4"]);
    // line-2 reassigned away from cp-1; the other client's pattern is untouched.
    assert.deepEqual(result.strippedFromOthers, [
      { patternId: "cp-1", linkedLineIds: ["line-1"] },
    ]);
  });

  it("returns empty results when the target pattern does not exist", () => {
    const result = applyFabricLineAssignment([], "missing", ["line-1"]);
    assert.deepEqual(result, { targetLinkedLineIds: [], strippedFromOthers: [] });
  });
});
