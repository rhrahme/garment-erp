import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  lineIdsForPatternPrint,
  linkedFabricRowsForPattern,
} from "./linked-fabric-rows-for-pattern.ts";
import type { ClientPattern } from "@/lib/types/pattern-library";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

function fabricLine(
  overrides: Partial<SalesOrderFabricLine> & { id: string; fabric_number: string }
): SalesOrderFabricLine {
  return {
    garment_type: "Trouser",
    label_count: 1,
    label_stickers: [{ code: "FR-0426-0006-SO-2026-0129-L01-TR", sequence: 1, piece_name: "Trouser" }],
    supplier_id: "zegna",
    supplier_name: "Zegna",
    quantity: 1.2,
    unit: "meters",
    unit_price: 0,
    composition: null,
    weight_gsm: null,
    width_cm: null,
    width_inches: null,
    color: null,
    ...overrides,
  };
}

function salesOrder(lines: SalesOrderFabricLine[]): SalesOrder {
  return {
    id: "so-129",
    so_number: "SO-2026-0129",
    client_id: "client-ajlan",
    client_code: "FR-0426-0006",
    client_name: "Abdel Aziz Fahd Al Ajlan",
    client_reference: null,
    order_date: "2026-07-26",
    delivery_date: null,
    delivery_destination: null,
    status: "open",
    notes: null,
    fabric_lines: lines,
    fabric_po_ids: [],
  };
}

function pattern(overrides: Partial<ClientPattern> = {}): ClientPattern {
  return {
    id: "cp-trouser",
    client_id: "client-ajlan",
    client_code: "FR-0426-0006",
    client_name: "Abdel Aziz Fahd Al Ajlan",
    garment_type: "trouser",
    description: null,
    base_pattern_id: null,
    base_size: null,
    house_brand_id: null,
    house_brand_code: null,
    fabric: "60087",
    unit: "in",
    versions: [],
    final_version_id: null,
    special_instructions: null,
    physical_pattern_kept: false,
    physical_pattern_location: null,
    files: [],
    notes: null,
    created_at: "2026-07-25T00:00:00Z",
    updated_at: "2026-07-25T00:00:00Z",
    pattern_ref: "Own Sample",
    linked_fabric_line_ids: ["line-old-60087"],
    ...overrides,
  };
}

describe("lineIdsForPatternPrint", () => {
  it("includes job-linked transfer lines that are missing from grouped fabrics", () => {
    const ids = lineIdsForPatternPrint(pattern(), [
      {
        client_pattern_id: "cp-trouser",
        sales_order_line_id: "line-xfer-in-66046",
      },
    ]);
    assert.ok(ids.includes("line-old-60087"));
    assert.ok(ids.includes("line-xfer-in-66046"));
  });

  it("ignores jobs for other patterns", () => {
    const ids = lineIdsForPatternPrint(pattern(), [
      { client_pattern_id: "cp-other", sales_order_line_id: "line-other" },
    ]);
    assert.deepEqual(ids, ["line-old-60087"]);
  });
});

describe("linkedFabricRowsForPattern", () => {
  it("lists the transferred fabric so Sewing A4s can print it", () => {
    const order = salesOrder([
      fabricLine({ id: "line-old-60087", fabric_number: "60087" }),
      fabricLine({ id: "line-xfer-in-66046", fabric_number: "66046" }),
    ]);
    const rows = linkedFabricRowsForPattern({
      pattern: pattern(),
      clientCode: "FR-0426-0006",
      clientName: "Abdel Aziz Fahd Al Ajlan",
      orders: [order],
      receipts: [],
      jobs: [
        {
          client_pattern_id: "cp-trouser",
          sales_order_line_id: "line-xfer-in-66046",
        },
      ],
    });
    const numbers = rows.map((row) => row.fabric_number).sort();
    assert.deepEqual(numbers, ["60087", "66046"]);
    assert.ok(rows.some((row) => row.line_id === "line-xfer-in-66046"));
  });
});
