import assert from "node:assert/strict";
import { test } from "node:test";
import { filterClientsByBrand, UNASSIGNED_FACTORY_BRAND_ID } from "@/lib/clients/filter";
import {
  filterClientsForSalesBrandScope,
  filterSalesClientsByBrand,
  getAllowedSalesBrandIds,
} from "@/lib/sales/access";
import type { ClientProfile } from "@/lib/types/clients";

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

test("getAllowedSalesBrandIds is open until assignments exist", () => {
  assert.equal(
    getAllowedSalesBrandIds({ email: "sales1@hagan.pro", isSalesOperator: true }),
    null
  );
});

test("filterClientsForSalesBrandScope keeps unassigned when scoped", () => {
  assert.deepEqual(
    filterClientsForSalesBrandScope(clients, ["gliani"]).map((item) => item.id),
    ["a", "b", "c"]
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
    ["c"]
  );
});
