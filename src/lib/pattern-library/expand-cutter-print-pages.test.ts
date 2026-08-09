import assert from "node:assert/strict";
import { test } from "node:test";
import {
  expandCutterPrintPages,
  expandProductionArticlePages,
} from "./expand-cutter-print-pages.ts";
import type { PatternSheetArticlePage, PatternSheetData } from "./sheet-data.ts";

function article(
  lineId: string,
  articleCode: string,
  fabricNumber: string
): PatternSheetArticlePage {
  return {
    line_id: lineId,
    article_code: articleCode,
    garment_type: "House Thobe",
    so_number: "SO-2026-0109",
    order: { so_number: "SO-2026-0109", order_date: null, delivery_date: null },
    fabric: {
      fabric_number: fabricNumber,
      supplier_name: "Loro Piana",
      composition: null,
      gsm: null,
      width_cm: 150,
      width_inches: null,
      color: null,
      ordered_meters: 3.5,
    },
    stickers: [
      {
        code: `${articleCode}-THB`,
        piece_name: "House Thobe",
        production_code: `FR-${articleCode}`,
        qr_payload: `https://example.test/${articleCode}`,
        role: "piece",
        piece_index: 1,
        piece_total: 1,
      },
    ],
  };
}

function consolidatedSheet(overrides: Partial<PatternSheetData> = {}): PatternSheetData {
  const pages = [
    article("line-30", "L31", "722026"),
    article("line-17", "L18", "206156"),
    article("line-16", "L17", "206155"),
  ];
  return {
    pattern: {
      id: "cp-house-thobe",
      pattern_ref: "FR-0226-0024-House-Thobe",
      garment_type: "House Thobe",
      fabric: "twill 100% cotton",
      unit: "in",
    } as PatternSheetData["pattern"],
    version: { id: "v1", version: 1, measurements: [] } as PatternSheetData["version"],
    base: null,
    job: {
      id: "pj-l31",
      sales_order_line_id: "line-30",
      fabric_number: "722026",
      pattern_code: "FR-0109-L31-HOUSE-THOBE",
    } as PatternSheetData["job"],
    scoped_job_id: null,
    order: pages[0]!.order,
    // Unscoped primary historically looked like the wrong sibling.
    fabric: pages[2]!.fabric,
    stickers: pages[2]!.stickers,
    article_pages: pages,
    measurement_point_index: [],
    derived_from: "Custom",
    house_brand: { code: "FR", name: "Fouad Rahme" },
    base_fill_warning: null,
    resolved_base_size: null,
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

test("production after consolidate: unscoped pack prints every fabric", () => {
  const pages = expandProductionArticlePages(consolidatedSheet());
  assert.deepEqual(
    pages.map((page) => page.fabric.fabric_number),
    ["722026", "206156", "206155"]
  );
});

test("production from L31 job: only 722026, never sibling 206155", () => {
  const pages = expandProductionArticlePages(
    consolidatedSheet({
      scoped_job_id: "pj-l31",
      fabric: article("line-30", "L31", "722026").fabric,
      stickers: article("line-30", "L31", "722026").stickers,
      article_pages: [article("line-30", "L31", "722026")],
    })
  );
  assert.equal(pages.length, 1);
  assert.equal(pages[0]?.fabric.fabric_number, "722026");
  assert.equal(pages[0]?.article_code, "L31");
});

test("production Overshirt+Trouser: one stitcher page per piece QR", () => {
  const compound: PatternSheetArticlePage = {
    ...article("line-57", "0133-L57", "771057"),
    garment_type: "Overshirt+Trouser",
    stickers: [
      {
        code: "OS",
        piece_name: "Overshirt",
        production_code: "FR-0133-L57-OS-1/2",
        qr_payload: "https://example.test/os",
        role: "piece",
        piece_index: 1,
        piece_total: 2,
      },
      {
        code: "TR",
        piece_name: "Trouser",
        production_code: "FR-0133-L57-TR-2/2",
        qr_payload: "https://example.test/tr",
        role: "piece",
        piece_index: 2,
        piece_total: 2,
      },
    ],
  };
  const pages = expandProductionArticlePages(
    consolidatedSheet({
      scoped_job_id: "pj-l57",
      pattern: {
        id: "cp-ot",
        pattern_ref: "FR-0626-0037-Overshirt+Trouser",
        garment_type: "Overshirt+Trouser",
        fabric: "771057",
        unit: "in",
      } as PatternSheetData["pattern"],
      job: {
        id: "pj-l57",
        sales_order_line_id: "line-57",
        fabric_number: "771057",
      } as PatternSheetData["job"],
      fabric: compound.fabric,
      stickers: compound.stickers,
      article_pages: [compound],
      measurement_point_index: [
        { id: "1-2-chest", name: "1/2 Chest", garment_types: ["overshirt"] },
        { id: "front-rise", name: "Front Rise", garment_types: ["trouser"] },
        { id: "custom-extra", name: "Custom", garment_types: [] },
      ],
      version: {
        id: "v1",
        version: 1,
        measurements: [
          { point_id: "1-2-chest", name: "1/2 Chest" },
          { point_id: "front-rise", name: "Front Rise" },
          { point_id: "custom-extra", name: "Custom" },
        ],
      } as PatternSheetData["version"],
    })
  );
  assert.equal(pages.length, 2);
  assert.equal(pages[0]?.piece_name, "Overshirt");
  assert.equal(pages[1]?.piece_name, "Trouser");
  assert.deepEqual(pages[0]?.stickers.map((s) => s.piece_name), ["Overshirt"]);
  assert.deepEqual(pages[1]?.stickers.map((s) => s.piece_name), ["Trouser"]);
  assert.ok(pages[0]?.measurement_point_ids?.includes("1-2-chest"));
  assert.ok(pages[0]?.measurement_point_ids?.includes("custom-extra"));
  assert.ok(pages[1]?.measurement_point_ids?.includes("front-rise"));
  assert.ok(!pages[1]?.measurement_point_ids?.includes("1-2-chest"));
  assert.ok(pages[0]?.measurement_point_names?.includes("1/2 chest"));
  assert.ok(pages[1]?.measurement_point_names?.includes("front rise"));
});

test("cutter from L31 job: stays on 722026 fabric pages", () => {
  const data = consolidatedSheet({
    scoped_job_id: "pj-l31",
    fabric: article("line-30", "L31", "722026").fabric,
    stickers: article("line-30", "L31", "722026").stickers,
    article_pages: [article("line-30", "L31", "722026")],
  });
  const pages = expandCutterPrintPages(data);
  assert.ok(pages.length >= 1);
  for (const page of pages) {
    assert.equal(page.data.fabric?.fabric_number, "722026");
  }
});

test("cutter Overshirt+Trouser: one page with both piece QRs", () => {
  const stickers = [
    {
      code: "OS",
      piece_name: "Overshirt",
      production_code: "FR-0133-L57-OS-1/2",
      qr_payload: "https://example.test/os",
      role: "piece" as const,
      piece_index: 1,
      piece_total: 2,
    },
    {
      code: "TR",
      piece_name: "Trouser",
      production_code: "FR-0133-L57-TR-2/2",
      qr_payload: "https://example.test/tr",
      role: "piece" as const,
      piece_index: 2,
      piece_total: 2,
    },
  ];
  const pages = expandCutterPrintPages(
    consolidatedSheet({
      scoped_job_id: "pj-l57",
      stickers,
      article_pages: [
        {
          ...article("line-57", "0133-L57", "771057"),
          garment_type: "Overshirt+Trouser",
          stickers,
        },
      ],
    })
  );
  assert.equal(pages.length, 1);
  assert.equal(pages[0]?.stickers.length, 2);
  assert.deepEqual(
    pages[0]?.stickers.map((s) => s.piece_name),
    ["Overshirt", "Trouser"]
  );
});
