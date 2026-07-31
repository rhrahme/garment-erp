import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCutNestPreview,
  metersFromFabricLineQuantity,
} from "./cut-nest-preview.ts";
import { buildAutoMarkerLayout } from "./marker-layout.ts";
import type { ClientPattern, PatternLibraryAttachment } from "@/lib/types/pattern-library";

function tudAttachment(): PatternLibraryAttachment {
  return {
    id: "plf-tud",
    kind: "tud",
    filename: "shorts.tud",
    stored_filename: "shorts.tud",
    content_type: "application/octet-stream",
    size_bytes: 100,
    uploaded_at: "2026-01-01T00:00:00.000Z",
    uploaded_by: "test",
    tud: {
      style_caption: "Shorts",
      source_path: null,
      sizes: ["M"],
      pieces: [
        {
          name: "FRONT",
          cut_quantity: 1,
          fabric: "SHEEL",
          per_size: { M: { area_m2: 0.2, perimeter_cm: 180 } },
        },
        {
          name: "BACK",
          cut_quantity: 1,
          fabric: "SHEEL",
          per_size: { M: { area_m2: 0.18, perimeter_cm: 170 } },
        },
      ],
      total_cut_pieces: 2,
      fabric_totals: [{ size: "M", fabric: "SHEEL", area_m2: 0.38, perimeter_cm: 350 }],
      size_totals: [{ size: "M", area_m2: 0.38, perimeter_cm: 350 }],
      total_area_m2: 0.38,
      total_perimeter_cm: 350,
    },
  };
}

function pattern(overrides: Partial<ClientPattern> = {}): ClientPattern {
  return {
    id: "cp-1",
    pattern_ref: "SHORTS",
    client_id: "c1",
    client_code: "FR-001",
    client_name: "Test",
    garment_type: "shorts",
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

describe("buildCutNestPreview", () => {
  it("builds nest with double fold assumed when fold unset", () => {
    const result = buildCutNestPreview(pattern(), 148);
    assert.equal(result.fold_assumed, true);
    assert.ok(result.nest);
    assert.equal(result.nest!.double_fold, true);
    assert.equal(result.nest!.usable_width_cm, 74);
    assert.equal(result.missing_reason, null);
    assert.ok(result.nest!.placements.length >= 2);
  });

  it("respects explicit open-width fold", () => {
    const result = buildCutNestPreview(
      pattern({ marker_double_fold: false }),
      148
    );
    assert.equal(result.fold_assumed, false);
    assert.ok(result.nest);
    assert.equal(result.nest!.double_fold, false);
    assert.equal(result.nest!.usable_width_cm, 148);
  });

  it("reports missing when no width", () => {
    const result = buildCutNestPreview(pattern(), null);
    assert.equal(result.nest, null);
    assert.match(result.missing_reason ?? "", /width/i);
  });

  it("uses linked fabric ref width when sheet width omitted", () => {
    const result = buildCutNestPreview(
      pattern({
        linked_fabric_refs: [
          {
            fabric_number: "S10008",
            supplier_id: null,
            width_cm: 148,
          },
        ],
      }),
      null
    );
    assert.ok(result.nest);
    assert.equal(result.nest!.fabric_width_cm, 148);
  });

  it("reports missing when no TUD", () => {
    const result = buildCutNestPreview(pattern({ files: [] }), 148);
    assert.equal(result.nest, null);
    assert.match(result.missing_reason ?? "", /TUD/i);
  });

  it("prefers saved marker_layout when width/fold/size match", () => {
    const base = pattern({ marker_fabric_width_cm: 148, marker_double_fold: true });
    const layout = buildAutoMarkerLayout(base);
    assert.ok(layout);
    const moved = {
      ...layout!,
      source: "manual" as const,
      placements: layout!.placements.map((p, i) =>
        i === 0 ? { ...p, x_cm: 9.5 } : p
      ),
    };
    const result = buildCutNestPreview(
      pattern({
        marker_fabric_width_cm: 148,
        marker_double_fold: true,
        marker_layout: moved,
      }),
      148
    );
    assert.equal(result.source, "saved");
    assert.ok(result.nest);
    assert.equal(result.nest!.placements[0]?.x_cm, 9.5);
  });

  it("falls back to auto when saved layout width differs", () => {
    const base = pattern({ marker_fabric_width_cm: 140, marker_double_fold: true });
    const layout = buildAutoMarkerLayout(base);
    assert.ok(layout);
    const result = buildCutNestPreview(
      pattern({
        marker_fabric_width_cm: 148,
        marker_double_fold: true,
        marker_layout: layout,
      }),
      148
    );
    assert.equal(result.source, "auto");
    assert.ok(result.nest);
  });

  it("uses ordered meters for board length and fits flag", () => {
    const result = buildCutNestPreview(pattern({ marker_double_fold: true }), 148, {
      ordered_length_m: 2,
    });
    assert.ok(result.nest);
    assert.equal(result.ordered_length_m, 2);
    assert.ok((result.board_length_m ?? 0) >= 2);
    assert.equal(result.fits_on_order, true);
    assert.ok(result.nest!.placements.length >= 2);
  });

  it("flags OVER when ordered meters shorter than packed", () => {
    const result = buildCutNestPreview(pattern({ marker_double_fold: true }), 148, {
      ordered_length_m: 0.01,
    });
    assert.ok(result.nest);
    assert.equal(result.fits_on_order, false);
  });

  it("parses fabric line meters from quantity", () => {
    assert.equal(metersFromFabricLineQuantity(1.6, "meters"), 1.6);
    assert.equal(metersFromFabricLineQuantity(2, "m"), 2);
    assert.equal(metersFromFabricLineQuantity(2, "yards"), null);
  });
});
