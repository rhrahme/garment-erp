import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMissingFilesReport,
  filterMissingFilesReport,
} from "@/lib/pattern-library/missing-files-report";
import type { PatternJob } from "@/lib/types/pattern";
import type { ClientPattern, PatternLibraryAttachment } from "@/lib/types/pattern-library";
import type { SalesOrder } from "@/lib/types/sales-orders";

function file(kind: PatternLibraryAttachment["kind"], id: string): PatternLibraryAttachment {
  return {
    id,
    kind,
    filename: `${id}.${kind}`,
    stored_filename: `${id}.${kind}`,
    content_type: "application/octet-stream",
    size_bytes: 10,
    uploaded_at: "2026-01-01T00:00:00.000Z",
    uploaded_by: "test",
  };
}

function pattern(overrides: Partial<ClientPattern> = {}): ClientPattern {
  return {
    id: "cp-1",
    pattern_ref: "SHIRT-1",
    client_id: "c-ajlan",
    client_code: "FR-001",
    client_name: "Ajlan",
    garment_type: "Shirt LS",
    description: null,
    base_pattern_id: null,
    base_size: null,
    house_brand_id: "fouad-rahme",
    house_brand_code: "FR",
    fabric: null,
    unit: "cm",
    versions: [],
    final_version_id: null,
    special_instructions: null,
    physical_pattern_kept: false,
    physical_pattern_location: null,
    files: [],
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function job(overrides: Partial<PatternJob> = {}): PatternJob {
  return {
    id: "job-1",
    sales_order_id: "so-1",
    sales_order_line_id: "line-1",
    so_number: "SO-2026-0001",
    client_id: "c-khaled",
    client_name: "Khaled",
    client_code: "FR-002",
    garment_type: "Trouser",
    piece_name: "Trouser",
    article_number: 1,
    fabric_number: "S1",
    supplier: "X",
    composition: null,
    gsm: null,
    width_cm: null,
    width_inches: null,
    color: null,
    meters: 2,
    status: "drafting",
    assigned_to: null,
    client_pattern_id: null,
    pattern_code: null,
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    fittings: [],
    revisions: [],
    trial_priority: false,
    ...overrides,
  } as PatternJob;
}

const emptyOrders: SalesOrder[] = [];

describe("missing files report", () => {
  it("groups clients by house brand and flags TUD DXF RUL", () => {
    const report = buildMissingFilesReport({
      patterns: [
        pattern({
          id: "cp-missing",
          pattern_ref: "NO-TUD",
          files: [],
        }),
        pattern({
          id: "cp-full",
          pattern_ref: "FULL",
          client_id: "c-full",
          client_name: "Done Client",
          files: [file("tud", "t1"), file("dxf", "d1"), file("rul", "r1")],
        }),
        pattern({
          id: "cp-gliani",
          pattern_ref: "GL-SHIRT",
          client_id: "c-gl",
          client_name: "Gliani Client",
          client_code: "GL-001",
          house_brand_id: "gliani",
          house_brand_code: "GL",
          files: [file("tud", "t2")],
        }),
      ],
      jobs: [],
      orders: emptyOrders,
    });

    assert.equal(report.brands[0]?.brand_name, "Fouad Rahme");
    assert.ok(report.brands.some((brand) => brand.brand_name === "Gliani"));
    const fr = report.brands.find((brand) => brand.brand_name === "Fouad Rahme");
    assert.ok(fr);
    assert.equal(fr.clients[0]?.client_name, "Ajlan");
    assert.equal(fr.clients[0]?.missing_tud_count, 1);
    const missing = fr.clients[0]?.patterns[0];
    assert.equal(missing?.has_tud, false);
    assert.equal(missing?.has_dxf, false);
    assert.equal(missing?.has_rul, false);

    const done = fr.clients.find((client) => client.client_name === "Done Client");
    assert.equal(done?.patterns[0]?.has_tud, true);
    assert.equal(done?.patterns[0]?.has_dxf, true);
    assert.equal(done?.patterns[0]?.has_rul, true);
  });

  it("lists unlinked jobs as no pattern and sorts missing TUD first", () => {
    const report = buildMissingFilesReport({
      patterns: [
        pattern({
          id: "cp-ok",
          client_id: "c-ok",
          client_name: "Ready",
          files: [file("tud", "t1"), file("dxf", "d1"), file("rul", "r1")],
        }),
      ],
      jobs: [job()],
      orders: emptyOrders,
    });
    const fr = report.brands.find((brand) => brand.brand_name === "Fouad Rahme");
    assert.ok(fr);
    assert.equal(fr.clients[0]?.client_name, "Khaled");
    assert.equal(fr.clients[0]?.patterns[0]?.no_pattern, true);
    assert.equal(fr.clients[0]?.patterns[0]?.has_tud, false);
    assert.match(fr.clients[0]?.patterns[0]?.href ?? "", /\/pattern\/orders\/so-1/);
  });

  it("filters missing TUD vs missing other files", () => {
    const report = buildMissingFilesReport({
      patterns: [
        pattern({ id: "a", files: [] }),
        pattern({
          id: "b",
          client_id: "c-other",
          client_name: "Needs DXF",
          files: [file("tud", "t1")],
        }),
      ],
      jobs: [],
      orders: emptyOrders,
    });
    const tudOnly = filterMissingFilesReport(report, "missing_tud");
    assert.equal(tudOnly.missing_tud_count, 1);
    assert.equal(tudOnly.brands[0]?.clients[0]?.client_name, "Ajlan");
    const otherOnly = filterMissingFilesReport(report, "missing_other");
    assert.equal(otherOnly.missing_other_count, 1);
    assert.equal(otherOnly.brands[0]?.clients[0]?.client_name, "Needs DXF");
  });
});
