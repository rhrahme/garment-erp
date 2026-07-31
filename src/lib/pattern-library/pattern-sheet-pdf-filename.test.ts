import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPatternSheetPdfFilename,
  slugPdfToken,
} from "./pattern-sheet-pdf-filename.ts";
import type { PatternSheetData } from "./sheet-data.ts";
import type { ClientPattern, ClientPatternVersion } from "@/lib/types/pattern-library";

function version(overrides: Partial<ClientPatternVersion> = {}): ClientPatternVersion {
  return {
    id: "cpv-1",
    version: 1,
    is_final: false,
    trial_date: null,
    measurements: [],
    special_instructions: null,
    notes: null,
    files: [],
    created_by: null,
    updated_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function pattern(overrides: Partial<ClientPattern> = {}): ClientPattern {
  return {
    id: "cp-1",
    pattern_ref: "SHORTS-LINEN-CUSTOM",
    client_id: "cu-1",
    client_code: "FR-0526-0002",
    client_name: "Youssef Al Rashed",
    garment_type: "shorts",
    description: null,
    base_pattern_id: null,
    base_size: "M",
    house_brand_id: null,
    house_brand_code: null,
    fabric: "linen",
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

function sheet(overrides: Partial<PatternSheetData> = {}): PatternSheetData {
  return {
    pattern: pattern(),
    version: version(),
    base: null,
    job: {
      id: "pj-1",
      so_number: "SO-2026-0002",
      fabric_number: "S10008",
    } as PatternSheetData["job"],
    order: { so_number: "SO-2026-0002", order_date: null, delivery_date: null },
    fabric: {
      fabric_number: "S10008",
      supplier_name: "Solbiati",
      composition: "ZEFIRO 100% COTTON",
      gsm: 240,
      width_cm: 148,
      width_inches: null,
      color: null,
    },
    stickers: [],
    derived_from: "Custom",
    house_brand: { code: "FR", name: "Fouad Rahme" },
    base_fill_warning: null,
    resolved_base_size: "M",
    cut_nest: { nest: null, fold_assumed: false, missing_reason: null, source: null },
    ...overrides,
  };
}

describe("slugPdfToken", () => {
  it("strips unsafe characters", () => {
    assert.equal(slugPdfToken("Youssef Al Rashed"), "Youssef-Al-Rashed");
    assert.equal(slugPdfToken("SO/2026:0002"), "SO-2026-0002");
  });
});

describe("buildPatternSheetPdfFilename", () => {
  it("uses client, garment, size, fabric, SO, and Sample for trial 1", () => {
    const name = buildPatternSheetPdfFilename(sheet());
    assert.equal(
      name,
      "FR-0526-0002-Youssef-Al-Rashed-shorts-M-S10008-SO-2026-0002-Sample.pdf"
    );
  });

  it("labels final sheets as Final", () => {
    const name = buildPatternSheetPdfFilename(
      sheet({ version: version({ version: 2, is_final: true }) })
    );
    assert.match(name, /Final\.pdf$/);
  });

  it("falls back when only pattern_ref is available", () => {
    const name = buildPatternSheetPdfFilename(
      sheet({
        pattern: pattern({
          client_code: "",
          client_name: "",
          garment_type: "",
          base_size: null,
        }),
        job: null,
        order: null,
        fabric: null,
        resolved_base_size: null,
      })
    );
    assert.equal(name, "SHORTS-LINEN-CUSTOM-Sample.pdf");
  });
});
