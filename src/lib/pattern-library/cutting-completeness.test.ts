import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluatePatternCuttingCompleteness,
  findActiveMarkerAttachment,
  formatCuttingCompletenessError,
} from "./cutting-completeness.ts";
import type { ClientPattern, PatternLibraryAttachment } from "@/lib/types/pattern-library";

function file(
  id: string,
  kind: PatternLibraryAttachment["kind"],
  extras: Partial<PatternLibraryAttachment> = {}
): PatternLibraryAttachment {
  return {
    id,
    kind,
    filename: `${id}.${kind === "tud" ? "tud" : kind === "marker" ? "mrk" : "bin"}`,
    stored_filename: `${id}.bin`,
    content_type: "application/octet-stream",
    size_bytes: 10,
    uploaded_at: extras.uploaded_at ?? "2026-01-01T00:00:00.000Z",
    uploaded_by: "pattern@test.com",
    ...extras,
  };
}

function basePattern(overrides: Partial<ClientPattern> = {}): ClientPattern {
  return {
    id: "cp-1",
    pattern_ref: "TEST",
    client_id: "c1",
    client_code: "FR001",
    client_name: "Test",
    garment_type: "suit",
    description: null,
    base_pattern_id: null,
    base_size: null,
    house_brand_id: null,
    house_brand_code: null,
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

describe("evaluatePatternCuttingCompleteness", () => {
  it("requires per-piece TUDs; marker file is never required", () => {
    const pattern = basePattern({
      files: [file("j", "tud", { piece_name: "Jacket" })],
    });
    const result = evaluatePatternCuttingCompleteness(pattern, ["Jacket", "Trouser"]);
    assert.equal(result.tuds_complete, false);
    assert.ok(result.missing_tud_labels.some((label) => label.includes("Trouser")));
    assert.equal(
      result.items.find((item) => item.id === "marker_file")?.optional,
      true
    );
    assert.ok(!result.missing_tud_labels.some((label) => /marker/i.test(label)));
  });

  it("is TUD-complete without any marker upload", () => {
    const pattern = basePattern({
      files: [
        file("j", "tud", { piece_name: "Jacket" }),
        file("t", "tud", { piece_name: "Trouser" }),
      ],
      active_tud_by_piece: { Jacket: "j", Trouser: "t" },
      marker_fabric_width_cm: 150,
      marker_double_fold: false,
    });
    const result = evaluatePatternCuttingCompleteness(pattern, ["Jacket", "Trouser"]);
    assert.equal(result.tuds_complete, true);
    assert.equal(result.nest_inputs_complete, true);
    assert.equal(formatCuttingCompletenessError(result, "tud"), null);
    assert.equal(findActiveMarkerAttachment(pattern), null);
  });

  it("tracks nest inputs separately from TUDs", () => {
    const pattern = basePattern({
      files: [file("a", "tud")],
      marker_fabric_width_cm: null,
      marker_double_fold: null,
    });
    const result = evaluatePatternCuttingCompleteness(pattern, []);
    assert.equal(result.tuds_complete, true);
    assert.equal(result.nest_inputs_complete, false);
    assert.ok(result.missing_nest_input_labels.includes("Fabric width (cm)"));
    assert.ok(result.missing_nest_input_labels.includes("Double fold (yes / no)"));
  });
});
