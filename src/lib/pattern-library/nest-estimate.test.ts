import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildNestRects,
  collectNestTudMetadata,
  effectiveUsableWidthCm,
  estimateNestFromTud,
  NEST_ESTIMATE_WASTE_FACTOR,
  packNestRects,
  rectFromAreaPerimeter,
} from "./nest-estimate.ts";
import type { ClientPattern, PatternLibraryAttachment, TudMetadata } from "@/lib/types/pattern-library";

function sampleTud(): TudMetadata {
  return {
    style_caption: "Test Shirt",
    source_path: null,
    sizes: ["M"],
    pieces: [
      {
        name: "FRONT",
        cut_quantity: 1,
        fabric: "SHEEL",
        per_size: { M: { area_m2: 0.3, perimeter_cm: 220 } },
      },
      {
        name: "BACK",
        cut_quantity: 1,
        fabric: "SHEEL",
        per_size: { M: { area_m2: 0.28, perimeter_cm: 210 } },
      },
      {
        name: "FUSE",
        cut_quantity: 2,
        fabric: "FINISH",
        per_size: { M: { area_m2: 0.02, perimeter_cm: 40 } },
      },
    ],
    total_cut_pieces: 4,
    fabric_totals: [
      { size: "M", fabric: "SHEEL", area_m2: 0.58, perimeter_cm: 430 },
      { size: "M", fabric: "FINISH", area_m2: 0.04, perimeter_cm: 80 },
    ],
    size_totals: [{ size: "M", area_m2: 0.62, perimeter_cm: 510 }],
    total_area_m2: 0.62,
    total_perimeter_cm: 510,
  };
}

describe("rectFromAreaPerimeter", () => {
  it("recovers a known rectangle from area and perimeter", () => {
    // 40 x 20 cm => A=800 cm2=0.08 m2, P=120
    const rect = rectFromAreaPerimeter(0.08, 120);
    assert.ok(Math.abs(rect.width_cm - 40) < 0.2);
    assert.ok(Math.abs(rect.height_cm - 20) < 0.2);
  });

  it("falls back to a square when perimeter is unusable", () => {
    const rect = rectFromAreaPerimeter(0.01, 0);
    assert.ok(Math.abs(rect.width_cm - 10) < 0.2);
    assert.ok(Math.abs(rect.height_cm - 10) < 0.2);
  });
});

describe("effectiveUsableWidthCm", () => {
  it("halves width for double fold", () => {
    assert.equal(effectiveUsableWidthCm(140, true), 70);
    assert.equal(effectiveUsableWidthCm(140, false), 140);
  });
});

describe("packNestRects", () => {
  it("packs rectangles within usable width", () => {
    const rects = buildNestRects(sampleTud(), "M", 1, { includeSecondary: false });
    assert.equal(rects.length, 2);
    const packed = packNestRects(rects, 70);
    assert.ok(packed.placements.length === 2);
    assert.ok(packed.packed_length_cm > 0);
    for (const p of packed.placements) {
      assert.ok(p.y_cm + p.height_cm <= 70 + 0.5);
    }
  });
});

describe("estimateNestFromTud", () => {
  it("estimates meters from shell area with waste factor", () => {
    const result = estimateNestFromTud({
      tud: sampleTud(),
      fabric_width_cm: 140,
      double_fold: true,
      size: "M",
      garment_qty: 1,
    });
    assert.ok(result);
    assert.equal(result!.usable_width_cm, 70);
    assert.equal(result!.area_m2, 0.58);
    const usableWidthM = 0.7;
    const expected = (0.58 / usableWidthM) * (1 + NEST_ESTIMATE_WASTE_FACTOR);
    assert.ok(Math.abs(result!.estimated_length_m - expected) < 0.001);
    assert.ok(result!.efficiency_pct > 0 && result!.efficiency_pct <= 100);
    assert.match(result!.disclaimer, /Approximate from TUD areas/);
    // Fusing skipped by default
    assert.ok(result!.placements.every((p) => p.name !== "FUSE"));
  });

  it("scales area by garment qty", () => {
    const one = estimateNestFromTud({
      tud: sampleTud(),
      fabric_width_cm: 150,
      double_fold: false,
      garment_qty: 1,
    });
    const two = estimateNestFromTud({
      tud: sampleTud(),
      fabric_width_cm: 150,
      double_fold: false,
      garment_qty: 2,
    });
    assert.ok(one && two);
    assert.equal(two!.area_m2, one!.area_m2 * 2);
    assert.ok(two!.placements.length >= one!.placements.length);
  });
});

describe("collectNestTudMetadata multi-piece", () => {
  it("prefixes piece names and does not sum colliding BACK qtys", () => {
    const tud = (
      name: string,
      size: string,
      qty: number
    ): NonNullable<PatternLibraryAttachment["tud"]> => ({
      style_caption: name,
      source_path: null,
      sizes: [size],
      pieces: [
        {
          name: "BACK",
          cut_quantity: qty,
          fabric: "SHEEL",
          per_size: { [size]: { area_m2: 0.2, perimeter_cm: 180 } },
        },
      ],
      total_cut_pieces: qty,
      fabric_totals: [],
      size_totals: [{ size, area_m2: 0.2 * qty, perimeter_cm: 180 * qty }],
      total_area_m2: 0.2 * qty,
      total_perimeter_cm: 180 * qty,
    });

    const file = (
      id: string,
      pieceName: string,
      meta: NonNullable<PatternLibraryAttachment["tud"]>
    ): PatternLibraryAttachment => ({
      id,
      kind: "tud",
      filename: `${id}.tud`,
      stored_filename: `${id}.tud`,
      content_type: "application/octet-stream",
      size_bytes: 10,
      uploaded_at: "2026-01-01T00:00:00.000Z",
      uploaded_by: "test",
      piece_name: pieceName,
      tud: meta,
    });

    const pattern = {
      id: "cp-ot",
      garment_type: "Overshirt+Trouser",
      versions: [],
      files: [
        file("os", "Overshirt", tud("OS", "RE-XXL", 2)),
        file("tr", "Trouser", tud("TR", "48", 2)),
      ],
      active_tud_by_piece: { Overshirt: "os", Trouser: "tr" },
    } as ClientPattern

    const merged = collectNestTudMetadata(pattern, ["Overshirt", "Trouser"]);
    assert.ok(merged);
    assert.equal(merged!.total_cut_pieces, 4);
    assert.equal(
      merged!.pieces.find((p) => p.name === "Overshirt: BACK")?.cut_quantity,
      2
    );
    assert.equal(
      merged!.pieces.find((p) => p.name === "Trouser: BACK")?.cut_quantity,
      2
    );
    assert.equal(merged!.pieces.filter((p) => p.name === "BACK").length, 0);
  });
});
