import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildNewClientId, buildNewClientProfile } from "@/lib/clients/create-client";
import { resolveBrandIdsForNewClient } from "@/lib/clients/new-client-brand";
import { isBlankClientPlaceholder } from "@/lib/clients/names";
import type { ClientProfile } from "@/lib/types/clients";

function makeClient(overrides: Partial<ClientProfile> = {}): ClientProfile {
  return {
    id: "client-1",
    code: "FR-0126-0001",
    joined_at: "2026-01-01T00:00:00.000Z",
    first_name: "Khaled",
    middle_name: null,
    last_name: "Al Omair",
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
    ...overrides,
  };
}

describe("resolveBrandIdsForNewClient", () => {
  it("uses the single sales-scoped brand when QC/sales has only one", () => {
    assert.deepEqual(
      resolveBrandIdsForNewClient({
        scopedBrandIds: ["fouad-rahme"],
        selectedBrandId: "gliani",
      }),
      ["fouad-rahme"]
    );
  });

  it("uses the open brand tab when the account is not brand-scoped", () => {
    assert.deepEqual(
      resolveBrandIdsForNewClient({
        scopedBrandIds: null,
        selectedBrandId: "gliani",
      }),
      ["gliani"]
    );
  });

  it("leaves brand empty when All is selected and the account is not scoped", () => {
    assert.deepEqual(
      resolveBrandIdsForNewClient({
        scopedBrandIds: ["fouad-rahme", "gliani"],
        selectedBrandId: null,
      }),
      []
    );
  });
});

describe("buildNewClientId", () => {
  it("slugifies the display name and suffixes collisions", () => {
    assert.equal(buildNewClientId("Mr Ali Hassan", []), "mr-ali-hassan");
    assert.equal(buildNewClientId("Mr Ali Hassan", ["mr-ali-hassan"]), "mr-ali-hassan-2");
    assert.equal(
      buildNewClientId("Mr Ali Hassan", ["mr-ali-hassan", "mr-ali-hassan-2"]),
      "mr-ali-hassan-3"
    );
  });
});

describe("buildNewClientProfile", () => {
  it("builds a person client with a brand code and no contact when redacted", () => {
    const result = buildNewClientProfile(
      {
        title: "Mr",
        first_name: "Hossein",
        last_name: "QC Test",
        brand_ids: ["fouad-rahme"],
        email: "hidden@example.com",
        phone: "+966500000000",
      },
      [makeClient()],
      { allowContactFields: false }
    );
    assert.ok(result.ok);
    assert.equal(result.client.title, "Mr");
    assert.equal(result.client.first_name, "Hossein");
    assert.equal(result.client.last_name, "QC Test");
    assert.equal(result.client.brand_ids[0], "fouad-rahme");
    assert.match(result.client.code, /^FR-\d{4}-\d{4}$/);
    assert.equal(result.client.email, null);
    assert.equal(result.client.phone, null);
    assert.equal(result.client.client_kind, "person");
  });

  it("rejects a create with no first/last or brand", () => {
    const missingName = buildNewClientProfile({ brand_ids: ["fouad-rahme"] }, []);
    assert.equal(missingName.ok, false);
    const missingBrand = buildNewClientProfile(
      { first_name: "Ali", last_name: "Hassan" },
      []
    );
    assert.equal(missingBrand.ok, false);
  });
});

describe("isBlankClientPlaceholder", () => {
  it("treats a brand-prefilled nameless Add-client row as droppable", () => {
    assert.equal(
      isBlankClientPlaceholder({
        first_name: "",
        last_name: "",
        brand_ids: ["fouad-rahme"],
        code: "FR-0826-0999",
        email: null,
        phone: null,
      }),
      true
    );
  });

  it("keeps a named new client", () => {
    assert.equal(
      isBlankClientPlaceholder({
        first_name: "Ali",
        last_name: "Hassan",
        brand_ids: ["fouad-rahme"],
        code: "FR-0826-0999",
        email: null,
        phone: null,
      }),
      false
    );
  });
});
