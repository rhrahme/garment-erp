import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { patternSheetPdfPageCount } from "./generate-pattern-sheet-pdf.ts";
import type { PatternSheetData } from "./sheet-data.ts";
import type {
  ClientPattern,
  ClientPatternMeasurement,
  ClientPatternVersion,
} from "@/lib/types/pattern-library";

function measurement(
  index: number,
  overrides: Partial<ClientPatternMeasurement> = {}
): ClientPatternMeasurement {
  return {
    point_id: `pt-${index}`,
    name: `Point ${index}`,
    remark: index % 5 === 0 ? "Front" : null,
    is_graded: true,
    base_value: 10 + index * 0.25,
    target_value: 10.5 + index * 0.25,
    sewn_value: index % 3 === 0 ? 10.2 + index * 0.25 : null,
    adjustment: index % 4 === 0 ? 0.3 : null,
    remarks: index % 7 === 0 ? "ease" : null,
    ...overrides,
  };
}

function version(overrides: Partial<ClientPatternVersion> = {}): ClientPatternVersion {
  return {
    id: "cpv-prod-1",
    version: 1,
    is_final: true,
    trial_date: "2026-07-20",
    measurements: Array.from({ length: 36 }, (_, i) => measurement(i + 1)),
    special_instructions: "Match waistband ease; press seams open.",
    notes: "Trial 1 fit OK at seat.",
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
    id: "cp-prod-1",
    pattern_ref: "SHORTS-LINEN-CUSTOM",
    client_id: "cu-1",
    client_code: "FR-0526-0002",
    client_name: "Youssef Al Rashed",
    garment_type: "shorts",
    description: "shorts pattern imported from Base Patterns /ALL/Youssef Al Rashed",
    base_pattern_id: null,
    base_size: "M",
    house_brand_id: null,
    house_brand_code: null,
    fabric: "linen",
    unit: "cm",
    versions: [],
    final_version_id: null,
    special_instructions: null,
    physical_pattern_kept: true,
    physical_pattern_location: "Drawer A",
    files: [],
    notes: "Keep grain on side seam.",
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
      pattern_code: "Youssef-shorts-M",
    } as PatternSheetData["job"],
    order: {
      so_number: "SO-2026-0002",
      order_date: "2026-06-01",
      delivery_date: "2026-07-15",
    },
    fabric: {
      fabric_number: "S10008",
      supplier_name: "Solbiati",
      composition: "ZEFIRO 100% COTTON",
      gsm: 240,
      width_cm: 148,
      width_inches: null,
      color: "Navy",
      ordered_meters: 2.5,
    },
    stickers: [
      {
        code: "P1",
        piece_name: "Front",
        production_code: "FR-0526-0002-S10008-01",
        qr_payload: "https://example.test/qr/front",
        role: "piece",
        piece_index: 1,
        piece_total: 3,
      },
      {
        code: "P2",
        piece_name: "Back",
        production_code: "FR-0526-0002-S10008-02",
        qr_payload: "https://example.test/qr/back",
        role: "piece",
        piece_index: 2,
        piece_total: 3,
      },
      {
        code: "P3",
        piece_name: "Waistband",
        production_code: "FR-0526-0002-S10008-03",
        qr_payload: "https://example.test/qr/wb",
        role: "piece",
        piece_index: 3,
        piece_total: 3,
      },
      {
        code: "PREP",
        piece_name: "Prep",
        production_code: "FR-0526-0002-S10008-PREP",
        qr_payload: "https://example.test/qr/prep",
        role: "prep",
        piece_index: null,
        piece_total: null,
      },
    ],
    derived_from: "FR · Comfort · Shorts",
    house_brand: { code: "FR", name: "Fouad Rahme" },
    base_fill_warning: null,
    resolved_base_size: "M",
    cut_nest: {
      nest: null,
      cutter_plan: null,
      ordered_length_m: null,
      board_length_m: null,
      fits_on_order: null,
      fold_assumed: false,
      missing_reason: null,
      source: null,
    },
    marker: null,
    tud_thumbnail_data_url: null,
    ...overrides,
  };
}

describe("generatePatternSheetPdf production", () => {
  it("fits a dense measurement sheet on exactly one A4 page", async () => {
    const pages = await patternSheetPdfPageCount(sheet(), "production");
    assert.equal(pages, 1);
  });

  it("still fits when the measurement list is extreme (trouser-sized)", async () => {
    const pages = await patternSheetPdfPageCount(
      sheet({
        version: version({
          measurements: Array.from({ length: 61 }, (_, i) => measurement(i + 1)),
        }),
        stickers: sheet().stickers.slice(0, 2),
      }),
      "production"
    );
    assert.equal(pages, 1);
  });
});
