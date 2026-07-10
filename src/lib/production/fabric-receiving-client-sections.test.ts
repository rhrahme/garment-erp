import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fabricReceivingClientSectionMeta,
  groupFabricReceivingCutsByClient,
} from "./fabric-receiving-client-sections.ts";
import type { FabricReceivingCutEntry } from "./fabric-receiving-client-sections.ts";
import type { FabricReceivingLineRow, FabricReceivingOrderRow } from "../types/fabric-receipts.ts";

function order(
  overrides: Partial<FabricReceivingOrderRow> & Pick<FabricReceivingOrderRow, "sales_order_id" | "so_number" | "client_code" | "client_name">
): FabricReceivingOrderRow {
  return {
    order_date: "2026-01-01",
    is_archived: false,
    order_status: "open",
    lines: [],
    pending_line_count: 0,
    active_line_count: 0,
    ...overrides,
  };
}

function line(
  overrides: Partial<FabricReceivingLineRow> & Pick<FabricReceivingLineRow, "sales_order_line_id" | "fabric_cut_code" | "status">
): FabricReceivingLineRow {
  return {
    receipt_id: null,
    article_number: 1,
    garment_type: "Jacket",
    fabric_number: "F-1",
    supplier_id: "sup-1",
    supplier_name: "Supplier",
    fabric_meters: 2,
    composition: null,
    weight_gsm: null,
    width_cm: null,
    width_inches: null,
    qr_payload: "",
    stickers: [],
    received_at: null,
    updated_at: null,
    fabric_prep_type: null,
    fabric_prep_step: null,
    scan_stage: "pending",
    scan_stage_label: "Pending",
    ...overrides,
  };
}

function entry(orderRow: FabricReceivingOrderRow, lineRow: FabricReceivingLineRow): FabricReceivingCutEntry {
  return { order: orderRow, line: lineRow };
}

test("groupFabricReceivingCutsByClient groups by client and nests orders", () => {
  const orderA1 = order({
    sales_order_id: "so-a1",
    so_number: "S100",
    client_code: "FR-0126-0001",
    client_name: "Alpha Client",
  });
  const orderA2 = order({
    sales_order_id: "so-a2",
    so_number: "S090",
    client_code: "FR-0126-0001",
    client_name: "Alpha Client",
  });
  const orderB = order({
    sales_order_id: "so-b1",
    so_number: "S110",
    client_code: "FR-0126-0002",
    client_name: "Beta Client",
  });

  const sections = groupFabricReceivingCutsByClient([
    entry(orderA1, line({ sales_order_line_id: "l-a1", fabric_cut_code: "CUT-A1", status: "pending" })),
    entry(orderA2, line({ sales_order_line_id: "l-a2", fabric_cut_code: "CUT-A2", status: "received" })),
    entry(orderB, line({ sales_order_line_id: "l-b1", fabric_cut_code: "CUT-B1", status: "pending" })),
  ]);

  assert.equal(sections.length, 2);
  assert.equal(sections[0]!.client_name, "Alpha Client");
  assert.equal(sections[0]!.orderGroups.length, 2);
  assert.equal(sections[0]!.orderGroups[0]!.order.so_number, "S100");
  assert.equal(fabricReceivingClientSectionMeta(sections[0]!), "2 fabric cuts · 2 orders");
  assert.equal(sections[1]!.client_name, "Beta Client");
});
