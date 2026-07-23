import assert from "node:assert/strict";
import { test } from "node:test";
import { filterClientsByBrand, UNASSIGNED_FACTORY_BRAND_ID } from "@/lib/clients/filter";
import {
  canAccessClient,
  canAccessSalesOrder,
  filterClientsForSalesBrandScope,
  filterSalesClientsByBrand,
  filterSalesOrdersForSession,
  getAllowedSalesBrandIds,
  mergeClientsForSalesBrandScope,
  parseSalesBrandScope,
} from "@/lib/sales/access";
import type { ClientProfile } from "@/lib/types/clients";
import type { SalesOrder } from "@/lib/types/sales-orders";

function client(partial: Partial<ClientProfile> & Pick<ClientProfile, "id" | "brand_ids">): ClientProfile {
  return {
    code: "GL-0001",
    joined_at: null,
    first_name: "Test",
    middle_name: null,
    last_name: "Client",
    contact_person: null,
    referred_by_first_name: null,
    referred_by_middle_name: null,
    referred_by_last_name: null,
    email: null,
    phone: null,
    country: null,
    city: null,
    address: null,
    payment_terms: null,
    client_reference_prefix: null,
    notes: null,
    is_active: true,
    ...partial,
  };
}

function order(
  partial: Partial<SalesOrder> & Pick<SalesOrder, "id" | "client_id" | "client_code">
): SalesOrder {
  return {
    so_number: "SO-0001",
    client_name: "Test",
    client_reference: null,
    order_date: "2026-01-01",
    delivery_date: null,
    delivery_destination: null,
    status: "open",
    notes: null,
    sales_owner_email: "sales1@hagan.pro",
    fabric_lines: [],
    fabric_po_ids: [],
    ...partial,
  };
}

const clients = [
  client({ id: "a", brand_ids: ["gliani"] }),
  client({ id: "b", brand_ids: ["fouad-rahme", "gliani"] }),
  client({ id: "c", brand_ids: [] }),
  client({ id: "d", brand_ids: ["fouad"] }),
];

test("filterClientsByBrand returns all when brand is null", () => {
  assert.equal(filterClientsByBrand(clients, null).length, 4);
});

test("filterClientsByBrand matches brand_ids membership", () => {
  assert.deepEqual(
    filterClientsByBrand(clients, "gliani").map((item) => item.id),
    ["a", "b"]
  );
});

test("filterClientsByBrand unassigned sentinel keeps empty brand_ids", () => {
  assert.deepEqual(
    filterClientsByBrand(clients, UNASSIGNED_FACTORY_BRAND_ID).map((item) => item.id),
    ["c"]
  );
});

test("parseSalesBrandScope maps email to brand allow-lists", () => {
  const map = parseSalesBrandScope(
    "sales1@hagan.pro:gliani, sales2@hagan.pro:fouad|fouad-rahme ,bad, :skip"
  );
  assert.deepEqual(map.get("sales1@hagan.pro"), ["gliani"]);
  assert.deepEqual(map.get("sales2@hagan.pro"), ["fouad", "fouad-rahme"]);
  assert.equal(map.has("bad"), false);
});

test("getAllowedSalesBrandIds reads SALES_BRAND_SCOPE for sales operators", () => {
  const previous = process.env.SALES_BRAND_SCOPE;
  process.env.SALES_BRAND_SCOPE = "sales1@hagan.pro:gliani";
  try {
    assert.deepEqual(
      getAllowedSalesBrandIds({ email: "sales1@hagan.pro", isSalesOperator: true }),
      ["gliani"]
    );
    assert.equal(
      getAllowedSalesBrandIds({ email: "sales2@hagan.pro", isSalesOperator: true }),
      null
    );
    assert.equal(
      getAllowedSalesBrandIds({ email: "sales1@hagan.pro", isSalesOperator: false }),
      null
    );
  } finally {
    if (previous === undefined) delete process.env.SALES_BRAND_SCOPE;
    else process.env.SALES_BRAND_SCOPE = previous;
  }
});

test("filterClientsForSalesBrandScope keeps Gliani and multi-brand, drops others", () => {
  assert.deepEqual(
    filterClientsForSalesBrandScope(clients, ["gliani"]).map((item) => item.id),
    ["a", "b"]
  );
});

test("filterSalesClientsByBrand combines scope and UI filter", () => {
  assert.deepEqual(
    filterSalesClientsByBrand(clients, "gliani", ["gliani", "fouad"]).map((item) => item.id),
    ["a", "b"]
  );
  assert.deepEqual(
    filterSalesClientsByBrand(clients, UNASSIGNED_FACTORY_BRAND_ID, ["gliani"]).map(
      (item) => item.id
    ),
    []
  );
});

test("canAccessClient and order filters enforce brand + owner", () => {
  const previous = process.env.SALES_BRAND_SCOPE;
  process.env.SALES_BRAND_SCOPE = "sales1@hagan.pro:gliani";
  try {
    const session = { email: "sales1@hagan.pro", isSalesOperator: true };
    assert.equal(canAccessClient(session, clients[0]), true);
    assert.equal(canAccessClient(session, clients[3]), false);

    const glianiOrder = order({
      id: "o1",
      client_id: "a",
      client_code: "GL-0526-0001",
      sales_owner_email: "sales1@hagan.pro",
    });
    const fouadOrder = order({
      id: "o2",
      client_id: "d",
      client_code: "FD-0526-0001",
      sales_owner_email: "sales1@hagan.pro",
    });
    const otherOwner = order({
      id: "o3",
      client_id: "a",
      client_code: "GL-0526-0001",
      sales_owner_email: "other@hagan.pro",
    });

    const byId = new Map(clients.map((item) => [item.id, item]));
    assert.equal(canAccessSalesOrder(session, glianiOrder, byId), true);
    assert.equal(canAccessSalesOrder(session, fouadOrder, byId), false);
    assert.equal(canAccessSalesOrder(session, otherOwner, byId), false);

    assert.deepEqual(
      filterSalesOrdersForSession(session, [glianiOrder, fouadOrder, otherOwner], clients).map(
        (item) => item.id
      ),
      ["o1"]
    );
  } finally {
    if (previous === undefined) delete process.env.SALES_BRAND_SCOPE;
    else process.env.SALES_BRAND_SCOPE = previous;
  }
});

test("mergeClientsForSalesBrandScope preserves out-of-scope rows", () => {
  const previous = [
    client({ id: "a", brand_ids: ["gliani"], code: "GL-1" }),
    client({ id: "d", brand_ids: ["fouad"], code: "FD-1" }),
  ];
  const incoming = [client({ id: "a", brand_ids: ["gliani"], code: "GL-1", first_name: "Updated" })];
  const merged = mergeClientsForSalesBrandScope(previous, incoming, ["gliani"]);
  assert.equal(merged.ok, true);
  if (!merged.ok) return;
  assert.deepEqual(
    merged.clients.map((item) => ({ id: item.id, first_name: item.first_name })),
    [
      { id: "d", first_name: "Test" },
      { id: "a", first_name: "Updated" },
    ]
  );
});

test("mergeClientsForSalesBrandScope rejects brands outside allow-list", () => {
  const previous = [client({ id: "a", brand_ids: ["gliani"] })];
  const incoming = [client({ id: "x", brand_ids: ["fouad"] })];
  const merged = mergeClientsForSalesBrandScope(previous, incoming, ["gliani"]);
  assert.equal(merged.ok, false);
});
