import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyMarkerLayoutSeed,
  buildAutoMarkerLayout,
  clampPlacement,
  recomputeMarkerMetrics,
  resolveMarkerFabricWidthDetails,
  rotatePlacement90,
  sanitizeMarkerLayout,
} from "./marker-layout.ts";
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

describe("marker-layout", () => {
  it("seeds layout when TUD + width present and layout unset", () => {
    const seeded = applyMarkerLayoutSeed(
      pattern({
        marker_fabric_width_cm: 148,
        marker_double_fold: null,
      })
    );
    assert.ok(seeded.marker_layout);
    assert.ok(seeded.marker_layout!.placements.length >= 2);
    assert.equal(seeded.marker_layout!.source, "auto");
    assert.equal(seeded.marker_double_fold, true);
    assert.equal(seeded.marker_layout!.double_fold, true);
  });

  it("does not clobber an existing saved layout", () => {
    const existing = buildAutoMarkerLayout(
      pattern({ marker_fabric_width_cm: 140, marker_double_fold: true })
    );
    assert.ok(existing);
    const moved = {
      ...existing!,
      source: "manual" as const,
      placements: existing!.placements.map((p, i) =>
        i === 0 ? { ...p, x_cm: 12.5 } : p
      ),
    };
    const next = applyMarkerLayoutSeed(
      pattern({
        marker_fabric_width_cm: 140,
        marker_double_fold: true,
        marker_layout: moved,
      })
    );
    assert.equal(next.marker_layout?.source, "manual");
    assert.equal(next.marker_layout?.placements[0]?.x_cm, 12.5);
  });

  it("uses linked fabric ref width when marker width unset", () => {
    const layout = buildAutoMarkerLayout(
      pattern({
        marker_fabric_width_cm: null,
        linked_fabric_refs: [
          {
            fabric_number: "S1",
            supplier_id: null,
            width_cm: 150,
          },
        ],
      })
    );
    assert.ok(layout);
    assert.equal(layout!.fabric_width_cm, 150);
  });

  it("resolves width from sales-order fabric lines before asking Pattern", () => {
    const resolved = resolveMarkerFabricWidthDetails(
      pattern({
        marker_fabric_width_cm: null,
        linked_fabric_line_ids: ["line-1"],
      }),
      {
        salesOrders: [
          {
            fabric_lines: [
              { id: "line-1", width_cm: 148 },
              { id: "line-2", width_cm: 140 },
            ],
          },
        ],
      }
    );
    assert.ok(resolved);
    assert.equal(resolved!.width_cm, 148);
    assert.equal(resolved!.source, "sales_order_line");
  });

  it("prefers hint/job width over SO when saved width missing", () => {
    const resolved = resolveMarkerFabricWidthDetails(
      pattern({
        marker_fabric_width_cm: null,
        linked_fabric_line_ids: ["line-1"],
      }),
      {
        hints: [152],
        salesOrders: [{ fabric_lines: [{ id: "line-1", width_cm: 148 }] }],
      }
    );
    assert.equal(resolved?.width_cm, 152);
    assert.equal(resolved?.source, "hint");
  });

  it("clamps and rotates placements within usable width", () => {
    const usable = 74;
    const rotated = rotatePlacement90(
      {
        id: "a",
        name: "FRONT",
        fabric: "SHEEL",
        x_cm: 0,
        y_cm: 70,
        width_cm: 40,
        height_cm: 20,
        rotated: false,
        secondary: false,
      },
      usable
    );
    assert.equal(rotated.width_cm, 20);
    assert.equal(rotated.height_cm, 40);
    assert.ok(rotated.y_cm + rotated.height_cm <= usable + 1e-6);

    const clamped = clampPlacement(
      {
        id: "b",
        name: "BACK",
        fabric: null,
        x_cm: -5,
        y_cm: 100,
        width_cm: 30,
        height_cm: 20,
        rotated: false,
        secondary: false,
      },
      usable
    );
    assert.equal(clamped.x_cm, 0);
    assert.ok(clamped.y_cm + clamped.height_cm <= usable + 1e-6);
  });

  it("recomputes length and efficiency from placements", () => {
    const metrics = recomputeMarkerMetrics(
      [
        {
          id: "1",
          name: "A",
          fabric: null,
          x_cm: 0,
          y_cm: 0,
          width_cm: 50,
          height_cm: 30,
          rotated: false,
          secondary: false,
        },
        {
          id: "2",
          name: "B",
          fabric: null,
          x_cm: 50,
          y_cm: 0,
          width_cm: 40,
          height_cm: 30,
          rotated: false,
          secondary: false,
        },
      ],
      74,
      0.5
    );
    assert.equal(metrics.packed_length_m, 0.9);
    assert.ok(metrics.efficiency_pct > 0);
  });

  it("sanitizes marker_layout payloads", () => {
    const ok = sanitizeMarkerLayout({
      size: "M",
      garment_qty: 1,
      fabric_width_cm: 148,
      double_fold: true,
      usable_width_cm: 74,
      area_m2: 0.38,
      placements: [
        {
          id: "FRONT-1",
          name: "FRONT",
          fabric: "SHEEL",
          x_cm: 0,
          y_cm: 0,
          width_cm: 40,
          height_cm: 30,
          rotated: false,
          secondary: false,
        },
      ],
      source: "manual",
    });
    assert.ok(ok);
    assert.equal(ok!.source, "manual");
    assert.equal(ok!.placements.length, 1);

    assert.equal(sanitizeMarkerLayout({ size: "M" }), undefined);
    assert.equal(sanitizeMarkerLayout(null), null);
  });
});
