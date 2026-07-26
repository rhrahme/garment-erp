import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listFabricTransferDestinations } from "./transfer-destinations.ts";
import type { SalesOrder } from "../types/sales-orders.ts";

function order(
  overrides: Partial<SalesOrder> & Pick<SalesOrder, "id" | "so_number" | "client_code" | "client_name">
): SalesOrder {
  return {
    client_id: overrides.client_id ?? "client-1",
    client_reference: `${overrides.client_code}-${overrides.so_number}`,
    order_date: "2026-07-01",
    delivery_destination: "RUH",
    status: overrides.status ?? "open",
    notes: null,
    fabric_lines: [],
    fabric_po_ids: [],
    retail_brand: null,
    ...overrides,
  };
}

const qcSession = { email: "hagan.qc@gmail.com", isSalesOperator: false };

describe("listFabricTransferDestinations", () => {
  it("excludes source, complete, and retail orders", () => {
    const orders = [
      order({
        id: "so-source",
        so_number: "SO-2026-0001",
        client_code: "GL-0101",
        client_name: "Source Client",
      }),
      order({
        id: "so-open",
        so_number: "SO-2026-0002",
        client_code: "FR-0426-0006",
        client_name: "Abdel Aziz Fahd Al Ajlan",
      }),
      order({
        id: "so-complete",
        so_number: "SO-2026-0003",
        client_code: "FR-0426-0007",
        client_name: "Khaled Al Moussa",
        status: "complete",
      }),
      order({
        id: "so-retail",
        so_number: "SO-2026-0004",
        client_code: "RM-0101",
        client_name: "Retail Order",
        retail_brand: "Gliani",
      }),
    ];

    const destinations = listFabricTransferDestinations("so-source", qcSession, orders);
    assert.deepEqual(
      destinations.map((row) => row.id),
      ["so-open"]
    );
  });

  it("sorts by client name then SO number", () => {
    const orders = [
      order({
        id: "so-b",
        so_number: "SO-2026-0002",
        client_code: "GL-0002",
        client_name: "Bravo",
      }),
      order({
        id: "so-a2",
        so_number: "SO-2026-0002",
        client_code: "GL-0001",
        client_name: "Alpha",
      }),
      order({
        id: "so-a1",
        so_number: "SO-2026-0001",
        client_code: "GL-0003",
        client_name: "Alpha",
      }),
    ];

    const destinations = listFabricTransferDestinations("so-source", qcSession, orders);
    assert.deepEqual(
      destinations.map((row) => row.id),
      ["so-a1", "so-a2", "so-b"]
    );
  });
});
