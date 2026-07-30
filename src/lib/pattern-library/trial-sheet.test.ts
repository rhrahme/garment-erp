import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTrialSheetColumns,
  trialSheetStatusLabel,
} from "@/lib/pattern-library/trial-sheet";
import type { ClientPattern, ClientPatternVersion } from "@/lib/types/pattern-library";

function version(
  n: number,
  opts: { is_final?: boolean; id?: string } = {}
): ClientPatternVersion {
  return {
    id: opts.id ?? `v${n}`,
    version: n,
    is_final: Boolean(opts.is_final),
    trial_date: null,
    measurements: [
      {
        point_id: "chest",
        name: "Chest",
        remark: null,
        is_graded: true,
        base_value: 40,
        target_value: 40 + n,
        sewn_value: null,
        adjustment: null,
        remarks: null,
      },
    ],
    special_instructions: null,
    notes: null,
    files: [],
    created_by: null,
    updated_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function pattern(versions: ClientPatternVersion[], finalId: string | null = null): ClientPattern {
  return {
    id: "cp-1",
    pattern_ref: "TEST",
    client_id: "c1",
    client_code: "FR-0001",
    client_name: "Test",
    garment_type: "Shirt LS",
    description: null,
    base_pattern_id: null,
    base_size: null,
    house_brand_id: null,
    house_brand_code: "FR",
    fabric: null,
    unit: "in",
    versions,
    final_version_id: finalId,
    special_instructions: null,
    physical_pattern_kept: false,
    physical_pattern_location: null,
    files: [],
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("trial sheet columns", () => {
  it("builds Sample | Trial N | Final with current on latest open trial", () => {
    const cols = buildTrialSheetColumns(pattern([version(1), version(2)]));
    assert.deepEqual(
      cols.map((c) => c.label),
      ["Sample", "Trial 1", "Trial 2", "Final"]
    );
    assert.equal(cols.find((c) => c.label === "Trial 2")?.isCurrent, true);
    assert.equal(cols.find((c) => c.kind === "final")?.versionId, null);
    assert.equal(trialSheetStatusLabel(pattern([version(1), version(2)])), "Current: Trial 2");
  });

  it("marks Final current when a trial is finalized", () => {
    const p = pattern([version(1), version(2, { is_final: true, id: "v2" })], "v2");
    const cols = buildTrialSheetColumns(p);
    assert.equal(cols.find((c) => c.kind === "final")?.versionId, "v2");
    assert.equal(cols.find((c) => c.kind === "final")?.isCurrent, true);
    assert.equal(trialSheetStatusLabel(p), "Final (Trial 2)");
  });
});
