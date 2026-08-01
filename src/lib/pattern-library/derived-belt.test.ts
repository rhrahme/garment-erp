import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  augmentDxfWithDerivedBelt,
  buildDerivedBeltPiece,
  dxfHasBeltPiece,
} from "./derived-belt.ts";
import type { ClientPattern, DxfMetadata } from "@/lib/types/pattern-library";

function patternWithWaist(): ClientPattern {
  return {
    id: "cp-test",
    client_id: "c1",
    client_name: "Test",
    client_code: null,
    pattern_ref: "SHORTS",
    garment_type: "shorts",
    description: null,
    base_pattern_id: null,
    base_size: "M",
    unit: "in",
    house_brand_id: null,
    house_brand_code: null,
    fabric: null,
    notes: null,
    special_instructions: null,
    physical_pattern_kept: false,
    physical_pattern_location: null,
    linked_fabric_line_ids: [],
    linked_fabric_refs: [],
    files: [],
    versions: [
      {
        id: "v1",
        version: 1,
        is_final: true,
        created_at: "2026-01-01T00:00:00.000Z",
        created_by: "t",
        updated_at: "2026-01-01T00:00:00.000Z",
        updated_by: "t",
        trial_date: null,
        notes: null,
        special_instructions: null,
        files: [],
        measurements: [
          {
            point_id: "1-2-waist-straight-relux",
            name: "1/2 Waist straight Relux",
            base_value: 35,
            target_value: 35,
            sewn_value: null,
            adjustment: null,
            is_graded: true,
            remark: null,
            remarks: null,
          },
          {
            point_id: "waist-band-height",
            name: "Waist band height",
            base_value: 1.5,
            target_value: 1.5,
            sewn_value: null,
            adjustment: null,
            is_graded: true,
            remark: null,
            remarks: null,
          },
        ],
      },
    ],
    final_version_id: "v1",
    active_tud_file_id: null,
    marker_fabric_width_cm: 148,
    marker_double_fold: true,
    marker_layout: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  } as ClientPattern;
}

function dxfTwoPieces(): DxfMetadata {
  return {
    style_caption: "Shorts",
    units: "in",
    sizes: ["M"],
    total_cut_pieces: 2,
    source: "dxf_polylines",
    pieces: [
      {
        name: "front",
        cut_quantity: 1,
        fabric: "SHEEL",
        size: "M",
        width_cm: 56,
        height_cm: 32,
        area_m2: 0.15,
        perimeter_cm: 170,
        outline_cm: [
          { x: 0, y: 0 },
          { x: 56, y: 0 },
          { x: 56, y: 32 },
          { x: 0, y: 32 },
        ],
      },
      {
        name: "back",
        cut_quantity: 1,
        fabric: "SHEEL",
        size: "M",
        width_cm: 62,
        height_cm: 48,
        area_m2: 0.22,
        perimeter_cm: 200,
        outline_cm: [
          { x: 0, y: 0 },
          { x: 62, y: 0 },
          { x: 62, y: 48 },
          { x: 0, y: 48 },
        ],
      },
    ],
  };
}

describe("derived belt", () => {
  it("builds belt from 1/2 waist + waistband height (inches)", () => {
    const belt = buildDerivedBeltPiece(patternWithWaist());
    assert.ok(belt);
    assert.equal(belt!.name, "belt");
    assert.ok(Math.abs(belt!.width_cm - 35 * 2.54) < 0.05);
    assert.ok(Math.abs(belt!.height_cm - 1.5 * 2.54 * 2) < 0.05);
    assert.ok(belt!.outline_cm.length >= 4);
  });

  it("appends belt when DXF has only front/back", () => {
    const out = augmentDxfWithDerivedBelt(dxfTwoPieces(), patternWithWaist());
    assert.equal(out.pieces.length, 3);
    assert.ok(dxfHasBeltPiece(out));
    assert.equal(out.total_cut_pieces, 3);
  });

  it("does not duplicate an existing belt piece", () => {
    const base = dxfTwoPieces();
    base.pieces.push({
      name: "belt",
      cut_quantity: 1,
      fabric: "SHEEL",
      size: "M",
      width_cm: 90,
      height_cm: 5,
      area_m2: 0.045,
      perimeter_cm: 190,
      outline_cm: [
        { x: 0, y: 0 },
        { x: 90, y: 0 },
        { x: 90, y: 5 },
        { x: 0, y: 5 },
      ],
    });
    base.total_cut_pieces = 3;
    const out = augmentDxfWithDerivedBelt(base, patternWithWaist());
    assert.equal(out.pieces.length, 3);
    assert.equal(out.pieces.filter((p) => p.name === "belt").length, 1);
    assert.equal(out.pieces.find((p) => p.name === "belt")!.width_cm, 90);
  });
});
