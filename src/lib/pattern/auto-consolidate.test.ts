import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClientPattern } from "../types/pattern-library.ts";
import type { SalesOrder, SalesOrderFabricLine } from "../types/sales-orders.ts";
import {
  buildFitFamilyKey,
  canonicalPatternGarmentType,
  normalizeCompositionKey,
  normalizeGarmentTypeFamily,
  normalizeWeightGsm,
  planAutoConsolidate,
  type AutoConsolidateJobInput,
} from "./auto-consolidate-grouping.ts";

function job(
  partial: Partial<AutoConsolidateJobInput> &
    Pick<AutoConsolidateJobInput, "id" | "client_id" | "garment_type">
): AutoConsolidateJobInput {
  return {
    client_name: partial.client_name ?? "Client",
    client_code: partial.client_code ?? "FR-0001",
    composition: partial.composition ?? "100% Cotton",
    gsm: partial.gsm ?? 240,
    sales_order_id: partial.sales_order_id ?? "so-1",
    sales_order_line_id: partial.sales_order_line_id ?? `${partial.id}-line`,
    client_pattern_id: partial.client_pattern_id ?? null,
    status: partial.status ?? "pending",
    fabric_number: partial.fabric_number ?? "F-1",
    ...partial,
  };
}

function fabricLine(
  id: string,
  index: number,
  overrides: Partial<SalesOrderFabricLine> = {}
): SalesOrderFabricLine {
  return {
    id,
    garment_type: "Short",
    label_count: 1,
    label_stickers: [{ code: `L${index + 1}`, piece_name: "Short", sequence: 1 }],
    supplier_id: "sup-1",
    supplier_name: "Supplier",
    fabric_number: `F-${index + 1}`,
    quantity: 2,
    unit: "m",
    unit_price: 0,
    composition: "100% Cotton",
    weight_gsm: 240,
    width_cm: null,
    width_inches: null,
    color: null,
    ...overrides,
  };
}

function order(
  id: string,
  lineIds: string[],
  extras: Partial<SalesOrder> = {}
): SalesOrder {
  return {
    id,
    so_number: extras.so_number ?? "SO-0001",
    client_id: extras.client_id ?? "client-a",
    client_name: extras.client_name ?? "Client A",
    client_code: extras.client_code ?? "FR-0001",
    client_reference: null,
    order_date: "2026-01-01",
    delivery_date: null,
    delivery_destination: null,
    status: extras.status ?? "open",
    notes: null,
    fabric_lines: lineIds.map((lineId, index) => fabricLine(lineId, index)),
    fabric_po_ids: [],
    ...extras,
  };
}

function pattern(
  partial: Partial<ClientPattern> & Pick<ClientPattern, "id" | "client_id" | "garment_type">
): ClientPattern {
  return {
    pattern_ref: partial.pattern_ref ?? "REF",
    client_code: partial.client_code ?? "FR-0001",
    client_name: partial.client_name ?? "Client A",
    description: null,
    base_pattern_id: null,
    base_size: null,
    house_brand_id: null,
    house_brand_code: null,
    fabric: null,
    linked_fabric_line_ids: partial.linked_fabric_line_ids ?? [],
    unit: "in",
    versions: [],
    final_version_id: null,
    special_instructions: null,
    physical_pattern_kept: false,
    physical_pattern_location: null,
    files: [],
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("normalizeGarmentTypeFamily", () => {
  it("maps Short / shorts / Shorts to the same family", () => {
    assert.equal(normalizeGarmentTypeFamily("Short"), "short");
    assert.equal(normalizeGarmentTypeFamily("shorts"), "short");
    assert.equal(normalizeGarmentTypeFamily("Shorts"), "short");
    assert.equal(canonicalPatternGarmentType("Shorts"), "Short");
  });

  it("keeps Suit separate from Jacket and Trouser", () => {
    assert.equal(normalizeGarmentTypeFamily("Suit"), "suit");
    assert.equal(normalizeGarmentTypeFamily("Jacket"), "jacket");
    assert.equal(normalizeGarmentTypeFamily("Trouser"), "trouser");
    assert.notEqual(normalizeGarmentTypeFamily("Suit"), normalizeGarmentTypeFamily("Jacket"));
  });
});

describe("composition and weight normalization", () => {
  it("normalizes composition case and spacing", () => {
    assert.equal(normalizeCompositionKey("100% COTTON"), normalizeCompositionKey("100% Cotton"));
    assert.equal(normalizeCompositionKey("  100% Cotton  "), "100% cotton");
  });

  it("rounds gsm and rejects missing keys", () => {
    assert.equal(normalizeWeightGsm(240.4), 240);
    assert.equal(normalizeWeightGsm(null), null);
    assert.equal(
      buildFitFamilyKey({ garment_type: "Short", composition: "100% Cotton", gsm: 240 }),
      "short|100% cotton|240"
    );
    assert.equal(
      buildFitFamilyKey({ garment_type: "Short", composition: null, gsm: 240 }),
      null
    );
  });
});

describe("planAutoConsolidate", () => {
  it("groups same client jobs by garment + composition + gsm", () => {
    const jobs = [
      job({
        id: "j1",
        client_id: "client-a",
        garment_type: "Short",
        sales_order_line_id: "line-1",
      }),
      job({
        id: "j2",
        client_id: "client-a",
        garment_type: "Shorts",
        sales_order_line_id: "line-2",
        fabric_number: "F-2",
      }),
      job({
        id: "j3",
        client_id: "client-a",
        garment_type: "Short",
        composition: "100% Linen",
        gsm: 200,
        sales_order_line_id: "line-3",
        fabric_number: "F-3",
      }),
    ];
    const orders = [order("so-1", ["line-1", "line-2", "line-3"], { client_id: "client-a" })];

    const plan = planAutoConsolidate({ jobs, orders, clientPatterns: [] });
    assert.equal(plan.groups.length, 1);
    assert.equal(plan.groups[0]!.job_ids.slice().sort().join(","), "j1,j2");
    assert.equal(plan.groups[0]!.action, "create");
    assert.equal(plan.groups[0]!.garment_type, "Short");
  });

  it("skips cancelled and orphan jobs", () => {
    const jobs = [
      job({
        id: "j1",
        client_id: "client-a",
        garment_type: "Short",
        sales_order_line_id: "line-1",
      }),
      job({
        id: "j2",
        client_id: "client-a",
        garment_type: "Short",
        sales_order_line_id: "line-2",
        status: "cancelled",
      }),
      job({
        id: "j3",
        client_id: "client-a",
        garment_type: "Short",
        sales_order_line_id: "missing-line",
      }),
    ];
    const orders = [order("so-1", ["line-1", "line-2"], { client_id: "client-a" })];

    const plan = planAutoConsolidate({ jobs, orders, clientPatterns: [] });
    assert.equal(plan.groups.length, 0);
    assert.ok(plan.skipped_cancelled_or_orphan >= 2);
  });

  it("prefers an existing pattern that already has a group fabric linked", () => {
    const jobs = [
      job({
        id: "j1",
        client_id: "client-a",
        garment_type: "Short",
        sales_order_line_id: "line-1",
        client_pattern_id: "cp-1",
      }),
      job({
        id: "j2",
        client_id: "client-a",
        garment_type: "Short",
        sales_order_line_id: "line-2",
      }),
    ];
    const orders = [order("so-1", ["line-1", "line-2"], { client_id: "client-a" })];
    const clientPatterns = [
      pattern({
        id: "cp-1",
        client_id: "client-a",
        garment_type: "Short",
        linked_fabric_line_ids: ["line-1"],
      }),
    ];

    const plan = planAutoConsolidate({ jobs, orders, clientPatterns });
    assert.equal(plan.groups.length, 1);
    assert.equal(plan.groups[0]!.action, "link_existing");
    assert.equal(plan.groups[0]!.preferred_pattern_id, "cp-1");
  });

  it("does not merge different clients onto one plan group", () => {
    const jobs = [
      job({
        id: "j1",
        client_id: "client-a",
        client_name: "Ralph",
        garment_type: "Short",
        sales_order_line_id: "line-a1",
        sales_order_id: "so-a",
      }),
      job({
        id: "j2",
        client_id: "client-a",
        client_name: "Ralph",
        garment_type: "Short",
        sales_order_line_id: "line-a2",
        sales_order_id: "so-a",
      }),
      job({
        id: "j3",
        client_id: "client-b",
        client_name: "Youssef",
        client_code: "FR-0002",
        garment_type: "Short",
        sales_order_line_id: "line-b1",
        sales_order_id: "so-b",
      }),
      job({
        id: "j4",
        client_id: "client-b",
        client_name: "Youssef",
        client_code: "FR-0002",
        garment_type: "Short",
        sales_order_line_id: "line-b2",
        sales_order_id: "so-b",
      }),
    ];
    const orders = [
      order("so-a", ["line-a1", "line-a2"], {
        client_id: "client-a",
        client_name: "Ralph",
      }),
      order("so-b", ["line-b1", "line-b2"], {
        client_id: "client-b",
        client_name: "Youssef",
        client_code: "FR-0002",
        so_number: "SO-0002",
      }),
    ];

    const plan = planAutoConsolidate({ jobs, orders, clientPatterns: [] });
    assert.equal(plan.groups.length, 2);
    assert.ok(plan.groups.every((group) => group.job_ids.length === 2));
    assert.equal(plan.cross_client_fit_families.length, 1);
    assert.equal(plan.cross_client_fit_families[0]!.clients.length, 2);
  });

  it("does not reuse a same-garment pattern for a different composition/weight", () => {
    const jobs = [
      job({
        id: "j1",
        client_id: "client-a",
        garment_type: "Short",
        composition: "100% Cotton",
        gsm: 240,
        sales_order_line_id: "line-1",
      }),
      job({
        id: "j2",
        client_id: "client-a",
        garment_type: "Short",
        composition: "100% Cotton",
        gsm: 240,
        sales_order_line_id: "line-2",
      }),
    ];
    const orders = [order("so-1", ["line-1", "line-2"], { client_id: "client-a" })];
    const clientPatterns = [
      pattern({
        id: "cp-linen",
        client_id: "client-a",
        garment_type: "Short",
        linked_fabric_line_ids: ["line-other"],
      }),
    ];
    // Other line is linen/different fit — patternMatchesFit should fail for cotton 240.
    orders[0]!.fabric_lines.push(
      fabricLine("line-other", 9, {
        composition: "100% Linen",
        weight_gsm: 200,
      })
    );

    const plan = planAutoConsolidate({ jobs, orders, clientPatterns });
    assert.equal(plan.groups[0]!.action, "create");
    assert.equal(plan.groups[0]!.preferred_pattern_id, null);
  });

  it("marks noop when all jobs already share the preferred pattern and lines", () => {
    const jobs = [
      job({
        id: "j1",
        client_id: "client-a",
        garment_type: "Short",
        sales_order_line_id: "line-1",
        client_pattern_id: "cp-1",
      }),
      job({
        id: "j2",
        client_id: "client-a",
        garment_type: "Short",
        sales_order_line_id: "line-2",
        client_pattern_id: "cp-1",
      }),
    ];
    const orders = [order("so-1", ["line-1", "line-2"], { client_id: "client-a" })];
    const clientPatterns = [
      pattern({
        id: "cp-1",
        client_id: "client-a",
        garment_type: "Short",
        linked_fabric_line_ids: ["line-1", "line-2"],
      }),
    ];

    const plan = planAutoConsolidate({ jobs, orders, clientPatterns });
    assert.equal(plan.groups[0]!.action, "noop");
  });
});
