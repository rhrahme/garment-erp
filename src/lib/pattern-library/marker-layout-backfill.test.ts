import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  backfillMarkerLayoutForPattern,
  backfillMarkerLayoutsForPatterns,
  patternNeedsMarkerBackfill,
} from "./marker-layout-backfill.ts";
import type { ClientPattern, PatternLibraryAttachment } from "@/lib/types/pattern-library";

function tudAttachment(): PatternLibraryAttachment {
  return {
    id: "plf-tud",
    kind: "tud",
    filename: "shirt.tud",
    stored_filename: "shirt.tud",
    content_type: "application/octet-stream",
    size_bytes: 100,
    uploaded_at: "2026-01-01T00:00:00.000Z",
    uploaded_by: "test",
    tud: {
      style_caption: "Shirt",
      source_path: null,
      sizes: ["M"],
      pieces: [
        {
          name: "FRONT",
          code: "C_2",
          cut_quantity: 2,
          fabric: "SHEEL",
          per_size: { M: { area_m2: 0.2, perimeter_cm: 180 } },
        },
      ],
      total_cut_pieces: 2,
      fabric_totals: [{ size: "M", fabric: "SHEEL", area_m2: 0.2, perimeter_cm: 180 }],
      size_totals: [{ size: "M", area_m2: 0.2, perimeter_cm: 180 }],
      total_area_m2: 0.2,
      total_perimeter_cm: 180,
    },
  };
}

function pattern(overrides: Partial<ClientPattern> = {}): ClientPattern {
  return {
    id: "cp-1",
    pattern_ref: "SHIRT",
    client_id: "c1",
    client_code: "FR-001",
    client_name: "Test",
    garment_type: "shirt",
    description: null,
    base_pattern_id: null,
    base_size: "M",
    house_brand_id: null,
    house_brand_code: null,
    fabric: null,
    unit: "cm",
    versions: [],
    final_version_id: null,
    special_instructions: null,
    physical_pattern_kept: false,
    physical_pattern_location: null,
    files: [tudAttachment()],
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("marker-layout-backfill", () => {
  it("seeds layout for existing TUD when SO width is known", () => {
    const base = pattern({
      marker_fabric_width_cm: null,
      linked_fabric_line_ids: ["line-1"],
    });
    assert.equal(patternNeedsMarkerBackfill(base), true);

    const result = backfillMarkerLayoutForPattern(base, {
      salesOrders: [{ fabric_lines: [{ id: "line-1", width_cm: 148 }] }],
    });
    assert.equal(result.changed, true);
    assert.equal(result.seeded_layout, true);
    assert.equal(result.filled_width, true);
    assert.equal(result.pattern.marker_fabric_width_cm, 148);
    assert.ok(result.pattern.marker_layout?.placements.length);
  });

  it("does not clobber a saved marker layout", () => {
    const seeded = backfillMarkerLayoutForPattern(
      pattern({
        marker_fabric_width_cm: 140,
        marker_double_fold: true,
      }),
      { hints: [140] }
    );
    assert.ok(seeded.pattern.marker_layout);
    const moved = {
      ...seeded.pattern,
      marker_layout: {
        ...seeded.pattern.marker_layout!,
        source: "manual" as const,
        placements: seeded.pattern.marker_layout!.placements.map((p, i) =>
          i === 0 ? { ...p, x_cm: 11 } : p
        ),
      },
    };
    const again = backfillMarkerLayoutForPattern(moved, { hints: [140] });
    assert.equal(again.seeded_layout, false);
    assert.equal(again.pattern.marker_layout?.placements[0]?.x_cm, 11);
  });

  it("batch summary counts no-width skips", () => {
    const summary = backfillMarkerLayoutsForPatterns([
      pattern({ id: "a", marker_fabric_width_cm: null }),
      pattern({
        id: "b",
        marker_fabric_width_cm: null,
        linked_fabric_refs: [{ fabric_number: "X", supplier_id: null, width_cm: 150 }],
      }),
    ]);
    assert.equal(summary.skipped_no_width, 1);
    assert.equal(summary.seeded_layout, 1);
    assert.equal(summary.filled_width, 1);
  });
});
