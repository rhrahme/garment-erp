import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canViewFabricStock,
  canViewPrices,
  redactFabricLinePrices,
  redactPriceFields,
  redactPurchaseOrderPrices,
  redactSalesOrderFabricPrices,
  redactSupplierFabricPrice,
} from "./fabric-price-access.ts";
import { RESTRICTED_PRICE_FIELD_NAMES } from "./price-field-names.ts";
import type { SessionContext } from "./session.ts";
import type { PurchaseOrder } from "@/lib/types/fabric-sourcing";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

function session(
  role:
    | "admin"
    | "client_manager"
    | "task_operator"
    | "production_operator"
    | "pattern_operator"
    | "sales_operator"
): SessionContext {
  const isAdmin = role === "admin";
  return {
    userId: role,
    email: `${role}@example.com`,
    role,
    isSuperAdmin: false,
    isAdmin,
    isClientManager: role === "client_manager",
    isTaskOperator: role === "task_operator",
    isProductionOperator: role === "production_operator",
    isPatternOperator: role === "pattern_operator",
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
      list_price: 149,
      min_order_qty: null,
      lead_time_days: 14,
      is_active: true,
      currency: "EUR",
    },
  }],
} as PurchaseOrder;

/** Mirrors GET /api/fabric-search item shape before role gate. */
function fabricSearchItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "drapers-10101",
    supplier_id: "drapers",
    supplier_name: "Drapers",
    fabric_number: "10101",
    composition: "100% WV",
    color: null,
    description: "PE23 - BLAZON",
    weight_gsm: 260,
    width_cm: 150,
    width_inches: null,
    unit_price: 71,
    list_price: 73.2,
    actual_price: 71,
    account_price: 71,
    price: 73.2,
    cost: 65,
    eur: 71,
    unit: "meters",
    stock_status: "in_stock",
    restock_date: null,
    disponibilita_meters: 12,
    api_is_available: true,
    mill_line: null,
    manual: false,
    currency: "EUR",
    ...overrides,
  };
}

function assertNoRestrictedPriceFields(value: unknown, context = "payload"): void {
  const json = JSON.stringify(value);
  for (const field of RESTRICTED_PRICE_FIELD_NAMES) {
    assert.equal(
      json.includes(`"${field}"`),
      false,
      `${context} leaked restricted field ${field}`
    );
  }
}

describe("restricted price field allowlist", () => {
  it("strips every registered price field name (top-level and nested)", () => {
    const sample = Object.fromEntries(
      RESTRICTED_PRICE_FIELD_NAMES.map((field, index) => [field, index + 1])
    );
    const redacted = redactPriceFields({
      fabric_number: "10101",
      composition: "Wool",
      nested: sample,
      rows: [sample],
    });
    assertNoRestrictedPriceFields(redacted, "redactPriceFields sample");
    assert.equal((redacted as { fabric_number: string }).fabric_number, "10101");
    assert.equal((redacted as { composition: string }).composition, "Wool");
    assert.deepEqual((redacted as { nested: Record<string, unknown> }).nested, {});
    assert.deepEqual((redacted as { rows: Record<string, unknown>[] }).rows, [{}]);
  });
});

for (const role of [
  "task_operator",
  "production_operator",
  "pattern_operator",
  "client_manager",
  "sales_operator",
] as const) {
  describe(`${role} endpoint payloads`, () => {
    it("cannot pass the central admin-only price gate", () => {
      assert.equal(canViewPrices(session(role)), false);
    });

    it("gets no price fields from GET /api/sales-orders and GET /api/sales-orders/:id", () => {
      const payload = { orders: [redactSalesOrderFabricPrices(order)] };
      assertNoRestrictedPriceFields(payload);
      assert.equal(payload.orders[0].fabric_lines[0].quantity, 2.5);
      assert.equal(payload.orders[0].fabric_lines[0].stock_status, "in_stock");
    });

    it("gets no price fields from PATCH /api/sales-orders/:id/fabric-lines", () => {
      const payload = {
        order: redactSalesOrderFabricPrices(order),
        updated_line: redactFabricLinePrices(line),
      };
      assertNoRestrictedPriceFields(payload);
      assert.equal(payload.updated_line.fabric_number, "781050");
      assert.equal(payload.updated_line.quantity, 2.5);
    });

    it("gets no price fields from fabric catalog and custom-fabric endpoints", () => {
      const fabric = {
        ...fabricPo.lines![0]!.supplier_fabric!,
        actual_price: 71,
        account_price: 71,
        price: 73.2,
        cost: 65,
        eur: 71,
      };
      const payload = redactSupplierFabricPrice(fabric);
      assertNoRestrictedPriceFields(payload);
      assert.equal(payload.composition, "Wool");
      assert.equal(payload.width_cm, 150);
    });

    it("gets no price fields from GET /api/fabric-search", () => {
      const payload = { items: [redactSupplierFabricPrice(fabricSearchItem())] };
      assertNoRestrictedPriceFields(payload);
      assert.equal(payload.items[0].fabric_number, "10101");
      assert.equal(payload.items[0].composition, "100% WV");
    });

    it("gets no price fields in server-rendered fabric PO props", () => {
      const payload = redactPurchaseOrderPrices(fabricPo);
      assertNoRestrictedPriceFields(payload);
      assert.equal(payload.lines?.[0]?.quantity_ordered, 2.5);
      assert.equal(payload.status, "draft");
    });
  });
}

describe("fabric stock visibility", () => {
  it("hides stock from sales operators only", () => {
    assert.equal(canViewFabricStock(session("sales_operator")), false);
    assert.equal(canViewFabricStock(session("admin")), true);
    assert.equal(canViewFabricStock(session("client_manager")), true);
    assert.equal(canViewFabricStock(session("task_operator")), true);
  });
});

describe("admin price access", () => {
  it("passes the role gate and retains payload prices", () => {
    assert.equal(canViewPrices(session("admin")), true);
    assert.equal(redactPriceFields({ name: "safe", unit_price: 10 }).name, "safe");
    assert.equal(line.unit_price, 125);
    assert.equal(fabricSearchItem().list_price, 73.2);
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
