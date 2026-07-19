import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildClientProfileFromOrphan,
  clientsCoverAllSalesOrderClientIds,
  findOrphanedSalesOrderClients,
  healSalesOrderClientFields,
  orderMatchesBrandClientPrefix,
  prepareClientsForPersist,
  reconcileOrphanedClients,
  retainClientsLinkedToSalesOrders,
  UNASSIGNED_CLIENT_SECTION_KEY,
  fabricReceivingClientSectionKey,
  fabricReceivingClientSectionLabel,
} from "./orphan-reconciliation.ts";
import type { ClientProfile } from "../types/clients.ts";

function client(overrides: Partial<ClientProfile> & Pick<ClientProfile, "id" | "code">): ClientProfile {
  return {
    joined_at: "2026-01-01T00:00:00.000Z",
    first_name: "Ada",
    middle_name: null,
    last_name: "Lovelace",
    brand_ids: ["fouad-rahme"],
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
    client_kind: "person",
    ...overrides,
  };
}

test("findOrphanedSalesOrderClients groups missing client profiles", () => {
  const orphans = findOrphanedSalesOrderClients(
    [client({ id: "c-1", code: "FR-0126-0001" })],
    [
      {
        id: "so-1",
        so_number: "SO-2026-0111",
        client_id: "new-orphan",
        client_code: "FR-0626-0037",
        client_name: "Pr Khaled Bin Salman",
        order_date: "2026-06-30",
      },
      {
        id: "so-2",
        so_number: "SO-2026-0116",
        client_id: "new-orphan",
        client_code: "FR-0626-0037",
        client_name: "Pr Khaled Bin Salman",
        order_date: "2026-07-02",
      },
      {
        id: "so-3",
        so_number: "SO-2026-0001",
        client_id: "c-1",
        client_code: "FR-0126-0001",
        client_name: "Ada Lovelace",
        order_date: "2026-01-02",
      },
    ]
  );

  assert.equal(orphans.length, 1);
  assert.equal(orphans[0]!.client_id, "new-orphan");
  assert.deepEqual(orphans[0]!.so_numbers, ["SO-2026-0111", "SO-2026-0116"]);
  assert.equal(orphans[0]!.earliest_order_date, "2026-06-30");
});

test("reconcileOrphanedClients restores Khaled-style orphan from order fields", () => {
  const result = reconcileOrphanedClients(
    [client({ id: "c-1", code: "FR-0126-0001" })],
    [
      {
        id: "so-1",
        so_number: "SO-2026-0116",
        client_id: "new-1782858921783",
        client_code: "FR-0626-0037",
        client_name: "Pr Khaled Bin Salman",
        order_date: "2026-07-02",
      },
    ]
  );

  assert.equal(result.restored.length, 1);
  assert.equal(result.clients.length, 2);
  const restored = result.restored[0]!;
  assert.equal(restored.id, "new-1782858921783");
  assert.equal(restored.code, "FR-0626-0037");
  assert.equal(restored.first_name, "Pr");
  assert.equal(restored.middle_name, "Khaled Bin");
  assert.equal(restored.last_name, "Salman");
  assert.deepEqual(restored.brand_ids, ["fouad-rahme"]);
  assert.equal(restored.is_active, true);
});

test("reconcileOrphanedClients skips when client_code already belongs to another profile", () => {
  const result = reconcileOrphanedClients(
    [client({ id: "c-other", code: "FR-0626-0037", first_name: "Someone", last_name: "Else" })],
    [
      {
        id: "so-1",
        so_number: "SO-2026-0116",
        client_id: "new-orphan",
        client_code: "FR-0626-0037",
        client_name: "Pr Khaled Bin Salman",
        order_date: "2026-07-02",
      },
    ]
  );
  assert.equal(result.restored.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.orphans.length, 1);
});

test("retainClientsLinkedToSalesOrders keeps omitted linked profiles", () => {
  const previous = [
    client({ id: "keep", code: "FR-1", first_name: "Keep", last_name: "Me" }),
    client({ id: "drop", code: "FR-2", first_name: "Drop", last_name: "Me" }),
  ];
  const next = [client({ id: "drop", code: "FR-2", first_name: "Drop", last_name: "Me" })];
  const result = retainClientsLinkedToSalesOrders(previous, next, [
    {
      id: "so-1",
      so_number: "SO-1",
      client_id: "keep",
      client_code: "FR-1",
      client_name: "Keep Me",
      order_date: "2026-01-01",
    },
  ]);

  assert.equal(result.retained.length, 1);
  assert.equal(result.retained[0]!.id, "keep");
  assert.equal(result.clients.some((row) => row.id === "keep"), true);
});

test("prepareClientsForPersist retains omitted linked and heals already-missing orphans", () => {
  // Regression: bulk UI save drops "keep", and "orphan" was already gone from
  // previous store — retain alone is not enough; heal must rebuild from SO fields.
  const previous = [client({ id: "keep", code: "FR-1", first_name: "Keep", last_name: "Me" })];
  const next: ClientProfile[] = [];
  const orders = [
    {
      id: "so-1",
      so_number: "SO-1",
      client_id: "keep",
      client_code: "FR-1",
      client_name: "Keep Me",
      order_date: "2026-01-01",
    },
    {
      id: "so-2",
      so_number: "SO-2026-0116",
      client_id: "new-1782858921783",
      client_code: "FR-0626-0037",
      client_name: "Pr Khaled Bin Salman",
      order_date: "2026-07-02",
    },
  ];

  const result = prepareClientsForPersist(previous, next, orders);

  assert.equal(result.retained.length, 1);
  assert.equal(result.retained[0]!.id, "keep");
  assert.equal(result.restored.length, 1);
  assert.equal(result.restored[0]!.id, "new-1782858921783");
  assert.equal(result.restored[0]!.code, "FR-0626-0037");
  assert.equal(clientsCoverAllSalesOrderClientIds(result.clients, orders), true);
});

test("prepareClientsForPersist fails closed if heal/retain regress", () => {
  // Would-be orphan outcome if save gate only trusted `next` — used as the
  // invariant assertion future refactors must keep green.
  const previous = [client({ id: "keep", code: "FR-1" })];
  const next = [client({ id: "other", code: "FR-9" })];
  const orders = [
    {
      id: "so-1",
      so_number: "SO-1",
      client_id: "keep",
      client_code: "FR-1",
      client_name: "Keep Me",
      order_date: "2026-01-01",
    },
  ];

  assert.equal(clientsCoverAllSalesOrderClientIds(next, orders), false);
  const prepared = prepareClientsForPersist(previous, next, orders);
  assert.equal(clientsCoverAllSalesOrderClientIds(prepared.clients, orders), true);
  assert.ok(prepared.clients.some((row) => row.id === "keep"));
  assert.ok(prepared.clients.some((row) => row.id === "other"));
});

test("buildClientProfileFromOrphan requires a client code and name", () => {
  assert.equal(
    buildClientProfileFromOrphan({
      client_id: "x",
      client_code: "",
      client_name: "Nameless",
      order_ids: ["so-1"],
      so_numbers: ["SO-1"],
      earliest_order_date: null,
    }),
    null
  );
  assert.equal(
    buildClientProfileFromOrphan({
      client_id: "x",
      client_code: "FR-0626-0037",
      client_name: "",
      order_ids: ["so-1"],
      so_numbers: ["SO-1"],
      earliest_order_date: null,
    }),
    null
  );
});

test("healSalesOrderClientFields fills blank denormalized fields from the clients store", () => {
  const clients = [
    client({
      id: "new-1782858921783",
      code: "FR-0626-0037",
      first_name: "Pr",
      middle_name: "Khaled Bin",
      last_name: "Salman",
    }),
  ];
  const orders = [
    {
      id: "so-1",
      so_number: "SO-2026-0116",
      client_id: "new-1782858921783",
      client_code: "",
      client_name: "",
      order_date: "2026-07-02",
    },
    {
      id: "so-2",
      so_number: "SO-2026-0117",
      client_id: "new-1782858921783",
      client_code: "FR-0626-0037",
      client_name: "Pr Khaled Bin Salman",
      order_date: "2026-07-03",
    },
  ];

  const result = healSalesOrderClientFields(orders, clients);

  assert.equal(result.repaired.length, 1);
  assert.equal(result.repaired[0]!.order_id, "so-1");
  assert.equal(result.repaired[0]!.client_name, "Pr Khaled Bin Salman");
  assert.equal(result.repaired[0]!.client_code, "FR-0626-0037");
  assert.equal(result.orders[0]!.client_name, "Pr Khaled Bin Salman");
  assert.equal(result.orders[0]!.client_code, "FR-0626-0037");
  // Already-populated order untouched.
  assert.equal(result.orders[1], orders[1]);
});

test("healSalesOrderClientFields never overwrites populated fields or invents data", () => {
  const clients = [
    client({ id: "c-1", code: "FR-0126-0001", first_name: "Ada", last_name: "Lovelace" }),
  ];
  const orders = [
    // Populated name that differs from the clients store stays as-is (repair-only).
    {
      id: "so-1",
      so_number: "SO-1",
      client_id: "c-1",
      client_code: "FR-0126-0001",
      client_name: "Ada Byron",
      order_date: "2026-01-01",
    },
    // Unknown client_id — nothing to repair from.
    {
      id: "so-2",
      so_number: "SO-2",
      client_id: "missing",
      client_code: "",
      client_name: "",
      order_date: "2026-01-02",
    },
    // No client_id at all.
    {
      id: "so-3",
      so_number: "SO-3",
      client_id: "",
      client_code: "",
      client_name: "",
      order_date: "2026-01-03",
    },
  ];

  const result = healSalesOrderClientFields(orders, clients);
  assert.equal(result.repaired.length, 0);
  assert.equal(result.orders, orders);
  assert.equal(result.orders[0]!.client_name, "Ada Byron");
});

test("fabric receiving section helpers surface unassigned bucket", () => {
  assert.equal(fabricReceivingClientSectionKey(""), UNASSIGNED_CLIENT_SECTION_KEY);
  assert.deepEqual(fabricReceivingClientSectionLabel("", ""), {
    client_code: "—",
    client_name: "Unassigned client",
  });
  assert.equal(orderMatchesBrandClientPrefix("", "FR"), true);
  assert.equal(orderMatchesBrandClientPrefix("FR-0626-0037", "FR"), true);
  assert.equal(orderMatchesBrandClientPrefix("GL-0626-0001", "FR"), false);
});
