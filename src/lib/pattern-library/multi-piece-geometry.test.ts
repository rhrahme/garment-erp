import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findSiblingPatternForPiece,
  garmentTypeMatchesPiece,
  hydrateMultiPieceGeometry,
} from "./multi-piece-geometry.ts";
import type { ClientPattern, PatternLibraryAttachment } from "@/lib/types/pattern-library";

function basePattern(overrides: Partial<ClientPattern>): ClientPattern {
  return {
    id: "cp-x",
    pattern_ref: "REF",
    client_id: "cu-1",
    client_code: "FR-1",
    client_name: "Test",
    garment_type: "Suit",
    description: null,
    base_pattern_id: null,
    base_size: null,
    house_brand_id: null,
    house_brand_code: null,
    fabric: null,
    unit: "cm",
    versions: [
      {
        id: "v1",
        version: 1,
        is_final: false,
        trial_date: null,
        measurements: [],
        special_instructions: null,
        notes: null,
        files: [],
        created_at: "2026-01-01T00:00:00.000Z",
        created_by: "test",
        updated_at: "2026-01-01T00:00:00.000Z",
        updated_by: "test",
      },
    ],
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

function tudFile(id: string): PatternLibraryAttachment {
  return {
    id,
    kind: "tud",
    filename: `${id}.tud`,
    stored_filename: `${id}.tud`,
    content_type: "application/octet-stream",
    size_bytes: 10,
    uploaded_at: "2026-01-01T00:00:00.000Z",
    uploaded_by: "test",
    tud: {
      style_caption: id,
      source_path: null,
      sizes: ["46"],
      pieces: [
        {
          name: "FRONT",
          cut_quantity: 1,
          fabric: "SHEEL",
          per_size: { "46": { area_m2: 0.2, perimeter_cm: 180 } },
        },
      ],
      total_cut_pieces: 1,
      fabric_totals: [{ size: "46", fabric: "SHEEL", area_m2: 0.2, perimeter_cm: 180 }],
      size_totals: [{ size: "46", area_m2: 0.2, perimeter_cm: 180 }],
      total_area_m2: 0.2,
      total_perimeter_cm: 180,
    },
  };
}

function dxfFile(id: string): PatternLibraryAttachment {
  return {
    id,
    kind: "dxf",
    filename: `${id}.dxf`,
    stored_filename: `${id}.dxf`,
    content_type: "application/dxf",
    size_bytes: 10,
    uploaded_at: "2026-01-02T00:00:00.000Z",
    uploaded_by: "test",
    dxf: {
      sizes: ["46"],
      pieces: [
        {
          name: "BACK",
          size: "46",
          fabric: "SHEEL",
          cut_quantity: 1,
          width_cm: 40,
          height_cm: 60,
          outline_cm: [
            { x: 0, y: 0 },
            { x: 40, y: 0 },
            { x: 40, y: 60 },
            { x: 0, y: 60 },
          ],
        },
      ],
    },
  };
}

describe("multi-piece-geometry", () => {
  it("matches jacket/trouser garment types to Suit pieces", () => {
    assert.equal(garmentTypeMatchesPiece("jacket", "Jacket"), true);
    assert.equal(garmentTypeMatchesPiece("trouser", "Trouser"), true);
    assert.equal(garmentTypeMatchesPiece("shorts", "Short"), true);
    assert.equal(garmentTypeMatchesPiece("shirt", "Jacket"), false);
  });

  it("prefers sibling with overlapping fabric lines", () => {
    const suit = basePattern({
      id: "suit",
      garment_type: "Suit",
      linked_fabric_line_ids: ["line-a"],
    });
    const jacketMatch = basePattern({
      id: "j-match",
      garment_type: "jacket",
      linked_fabric_line_ids: ["line-a"],
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    const jacketOther = basePattern({
      id: "j-other",
      garment_type: "jacket",
      linked_fabric_line_ids: ["line-b"],
      updated_at: "2026-06-01T00:00:00.000Z",
    });
    const found = findSiblingPatternForPiece(suit, "Jacket", [
      suit,
      jacketOther,
      jacketMatch,
    ]);
    assert.equal(found?.id, "j-match");
  });

  it("hydrates Suit shell from jacket DXF + trouser TUD", () => {
    const suit = basePattern({
      id: "suit",
      garment_type: "Suit",
      pattern_ref: "FR-Suit",
      linked_fabric_line_ids: ["line-a"],
    });
    const jacket = basePattern({
      id: "jacket",
      garment_type: "jacket",
      linked_fabric_line_ids: ["line-a"],
      marker_fabric_width_cm: 150,
      marker_double_fold: true,
      base_size: "46",
      files: [tudFile("j-tud"), dxfFile("j-dxf")],
    });
    const trouser = basePattern({
      id: "trouser",
      garment_type: "trouser",
      linked_fabric_line_ids: ["line-a"],
      files: [tudFile("t-tud")],
    });

    const { pattern, borrowed, borrowed_from } = hydrateMultiPieceGeometry(suit, [
      suit,
      jacket,
      trouser,
    ]);
    assert.equal(borrowed, true);
    assert.equal(borrowed_from.Jacket, "jacket");
    assert.equal(borrowed_from.Trouser, "trouser");
    assert.equal(pattern.marker_fabric_width_cm, 150);
    assert.equal(pattern.marker_double_fold, true);
    assert.equal(pattern.base_size, "46");
    assert.ok(pattern.files.some((f) => f.kind === "dxf" && f.piece_name === "Jacket"));
    assert.ok(pattern.files.some((f) => f.kind === "tud" && f.piece_name === "Jacket"));
    assert.ok(pattern.files.some((f) => f.kind === "tud" && f.piece_name === "Trouser"));
    assert.equal(pattern.active_tud_by_piece?.Jacket?.includes("j-tud"), true);
    assert.equal(pattern.active_tud_by_piece?.Trouser?.includes("t-tud"), true);
  });
});
