import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildClientProfileFromOrphan,
  findOrphanedSalesOrderClients,
  orderMatchesBrandClientPrefix,
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
