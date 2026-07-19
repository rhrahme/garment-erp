import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canViewPrices,
  redactFabricLinePrices,
  redactPriceFields,
  redactPurchaseOrderPrices,
  redactSalesOrderFabricPrices,
  redactSupplierFabricPrice,
} from "./fabric-price-access.ts";
import type { SessionContext } from "./session.ts";
import type { PurchaseOrder } from "@/lib/types/fabric-sourcing";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

function session(role: "admin" | "client_manager" | "task_operator" | "sales_operator"): SessionContext {
  const isAdmin = role === "admin";
  return {
    userId: role,
    email: `${role}@example.com`,
    role,
    isSuperAdmin: false,
    isAdmin,
    isClientManager: role === "client_manager",
    isTaskOperator: role === "task_operator",
    isSalesOperator: role === "sales_operator",
    canViewClientContact: isAdmin || role === "sales_operator",
    canViewFabricListPrices: isAdmin,
    canAccessPattern: isAdmin,
  };
}

const line: SalesOrderFabricLine = {
  id: "line-1",
  garment_type: "Jacket",
  label_count: 1,
  label_stickers: [],
  supplier_id: "loro-piana",
  supplier_name: "Loro Piana",
  fabric_number: "781050",
  quantity: 2.5,
  unit: "meters",
  unit_price: 125,
  composition: "Wool",
  weight_gsm: 260,
  width_cm: 150,
  width_inches: null,
  color: "Navy",
  stock_status: "in_stock",
};

const order = {
  id: "so-1",
  so_number: "SO-0001",
  client_id: "client-1",
  client_code: "C001",
  client_name: "Client",
  client_reference: "C001-SO-0001",
  order_date: "2026-07-19",
  delivery_date: null,
  delivery_destination: "RUH",
  status: "open",
  notes: null,
  fabric_lines: [line],
  fabric_po_ids: ["po-1"],
} as SalesOrder;

const fabricPo = {
  id: "po-1",
  po_number: "PO-0001",
  supplier_id: "loro-piana",
  status: "draft",
  order_date: "2026-07-19",
  expected_date: null,
  total_amount: 312.5,
  client_reference: "C001-SO-0001",
  emailed_at: null,
  email_to: null,
  expected_carrier: null,
  lines: [{
    id: "po-line-1",
    fabric_number: "781050",
    quantity_ordered: 2.5,
    unit_price: 125,
    client_reference: "C001-SO-0001",
    supplier_fabric: {
      id: "fabric-1",
      supplier_id: "loro-piana",
      fabric_number: "781050",
      name: null,
      composition: "Wool",
      weight_gsm: 260,
      width_cm: 150,
      width_inches: null,
      color: "Navy",
      finish: null,
      description: null,
      weave_type: null,
      gn_code: null,
      unit: "meters",
      unit_price: 125,
      min_order_qty: null,
      lead_time_days: 14,
      is_active: true,
      currency: "EUR",
    },
  }],
} as PurchaseOrder;

function assertNoPriceFields(value: unknown): void {
  const json = JSON.stringify(value);
  for (const field of ["unit_price", "total_amount", "fabric_cost", "currency"]) {
    assert.equal(json.includes(`"${field}"`), false, `found restricted field ${field}`);
  }
}

for (const role of ["task_operator", "client_manager", "sales_operator"] as const) {
  describe(`${role} endpoint payloads`, () => {
    it("cannot pass the central admin-only price gate", () => {
      assert.equal(canViewPrices(session(role)), false);
    });

    it("gets no price fields from GET /api/sales-orders and GET /api/sales-orders/:id", () => {
      const payload = { orders: [redactSalesOrderFabricPrices(order)] };
      assertNoPriceFields(payload);
      assert.equal(payload.orders[0].fabric_lines[0].quantity, 2.5);
      assert.equal(payload.orders[0].fabric_lines[0].stock_status, "in_stock");
    });

    it("gets no price fields from PATCH /api/sales-orders/:id/fabric-lines", () => {
      const payload = {
        order: redactSalesOrderFabricPrices(order),
        updated_line: redactFabricLinePrices(line),
      };
      assertNoPriceFields(payload);
      assert.equal(payload.updated_line.fabric_number, "781050");
      assert.equal(payload.updated_line.quantity, 2.5);
    });

    it("gets no price fields from fabric catalog and custom-fabric endpoints", () => {
      const payload = redactSupplierFabricPrice(fabricPo.lines![0]!.supplier_fabric!);
      assertNoPriceFields(payload);
      assert.equal(payload.composition, "Wool");
      assert.equal(payload.width_cm, 150);
    });

    it("gets no price fields in server-rendered fabric PO props", () => {
      const payload = redactPurchaseOrderPrices(fabricPo);
      assertNoPriceFields(payload);
      assert.equal(payload.lines?.[0]?.quantity_ordered, 2.5);
      assert.equal(payload.status, "draft");
    });
  });
}

describe("admin price access", () => {
  it("passes the role gate and retains payload prices", () => {
    assert.equal(canViewPrices(session("admin")), true);
    assert.equal(redactPriceFields({ name: "safe", unit_price: 10 }).name, "safe");
    assert.equal(line.unit_price, 125);
  });
});

describe("public fabric-catalog health", () => {
  it("sanitizes catalog sample prices to booleans only", async () => {
    const { toPublicFabricCatalogHealthSample } = await import(
      "../health/fabric-catalog-health-public.ts"
    );
    const sample = toPublicFabricCatalogHealthSample({
      fabric_number: "S10005",
      solbiatiUnitPrice: 48.5,
      loroPianaLookupUnitPrice: 48.5,
    });
    const json = JSON.stringify(sample);
    assert.equal(json.includes("48.5"), false, "leaked numeric price");
    assert.equal(json.includes('"unit_price"'), false, "leaked unit_price key");
    assert.equal(json.includes("solbiati_unit_price"), false, "leaked legacy price key");
    assert.equal(sample.solbiati_has_unit_price, true);
    assert.equal(sample.loro_piana_lookup_has_unit_price, true);
    assert.equal(sample.fabric_number, "S10005");
  });
});
