import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyNameChangeApproval,
  applyNameChangeRejection,
  applyNameChangeRequest,
  buildClientNameChangeRequestSummary,
  isClientNameChangePending,
  listPendingClientNameChangeRequests,
} from "@/lib/clients/name-change-requests";
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

describe("applyNameChangeRequest", () => {
  it("stamps a pending request without touching the current name", () => {
    const result = applyNameChangeRequest(
      makeClient(),
      { first_name: "Khalid", middle_name: null, last_name: "Al Omair" },
      "hagan.qc@gmail.com",
      "2026-08-17T12:00:00.000Z"
    );
    assert.ok(result.ok);
    assert.equal(result.client.first_name, "Khaled");
    assert.equal(result.client.name_change_first_name, "Khalid");
    assert.equal(result.client.name_change_requested_by, "hagan.qc@gmail.com");
    assert.equal(result.client.name_change_requested_at, "2026-08-17T12:00:00.000Z");
    assert.ok(isClientNameChangePending(result.client));
  });

  it("rejects a proposal without first or last name", () => {
    const result = applyNameChangeRequest(
      makeClient(),
      { first_name: "Khalid", middle_name: null, last_name: "  " },
      "qc"
    );
    assert.ok(!result.ok);
    assert.equal(result.status, 400);
  });

  it("rejects a proposal identical to the current name (incl. middle normalization)", () => {
    const result = applyNameChangeRequest(
      makeClient(),
      { first_name: " Khaled ", middle_name: "", last_name: "Al Omair" },
      "qc"
    );
    assert.ok(!result.ok);
    assert.equal(result.status, 400);
  });

  it("overwrites an earlier pending proposal (latest wins)", () => {
    const first = applyNameChangeRequest(
      makeClient(),
      { first_name: "Khalid", middle_name: null, last_name: "Al Omair" },
      "qc"
    );
    assert.ok(first.ok);
    const second = applyNameChangeRequest(
      first.client,
      { first_name: "Khaled", middle_name: "Bin Salman", last_name: "Al Omair" },
      "qc"
    );
    assert.ok(second.ok);
    assert.equal(second.client.name_change_middle_name, "Bin Salman");
  });
});

describe("applyNameChangeApproval", () => {
  it("applies the proposed name and clears the request", () => {
    const requested = applyNameChangeRequest(
      makeClient(),
      { first_name: "Khalid", middle_name: "Bin Fahd", last_name: "Al Omair" },
      "qc"
    );
    assert.ok(requested.ok);
    const approved = applyNameChangeApproval(requested.client);
    assert.ok(approved.ok);
    assert.equal(approved.client.first_name, "Khalid");
    assert.equal(approved.client.middle_name, "Bin Fahd");
    assert.equal(approved.client.last_name, "Al Omair");
    assert.ok(!isClientNameChangePending(approved.client));
  });

  it("fails when nothing is pending", () => {
    const result = applyNameChangeApproval(makeClient());
    assert.ok(!result.ok);
    assert.equal(result.status, 400);
  });
});

describe("applyNameChangeRejection", () => {
  it("keeps the current name and clears the request", () => {
    const requested = applyNameChangeRequest(
      makeClient(),
      { first_name: "Khalid", middle_name: null, last_name: "Al Omair" },
      "qc"
    );
    assert.ok(requested.ok);
    const rejected = applyNameChangeRejection(requested.client);
    assert.equal(rejected.first_name, "Khaled");
    assert.ok(!isClientNameChangePending(rejected));
    assert.equal(rejected.name_change_first_name, null);
  });
});

describe("listPendingClientNameChangeRequests", () => {
  it("lists only pending clients, newest first, with display names", () => {
    const a = applyNameChangeRequest(
      makeClient({ id: "a", code: "FR-1" }),
      { first_name: "New", middle_name: null, last_name: "NameA" },
      "qc",
      "2026-08-17T10:00:00.000Z"
    );
    const b = applyNameChangeRequest(
      makeClient({ id: "b", code: "FR-2" }),
      { first_name: "New", middle_name: null, last_name: "NameB" },
      "qc",
      "2026-08-17T11:00:00.000Z"
    );
    assert.ok(a.ok && b.ok);
    const list = listPendingClientNameChangeRequests([
      a.client,
      makeClient({ id: "c", code: "FR-3" }),
      b.client,
    ]);
    assert.equal(list.length, 2);
    assert.equal(list[0]!.client_id, "b");
    assert.equal(list[0]!.proposed_name, "New NameB");
    assert.equal(list[1]!.current_name, "Khaled Al Omair");
  });

  it("summary is null for clients without a pending request", () => {
    assert.equal(buildClientNameChangeRequestSummary(makeClient()), null);
  });
});
