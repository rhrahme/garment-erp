import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addPointToAllVersions,
  buildTrialSheetColumns,
  movePointOnAllVersions,
  patchPointOnAllVersions,
  remarksForPoint,
  removePointFromAllVersions,
  renamePointOnAllVersions,
  trialSheetPoints,
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

  it("reads stitcher remarks from the current trial row", () => {
    const v1 = version(1);
    const v2 = version(2);
    v2.measurements[0]!.remarks = "shorten 2cm";
    const p = pattern([v1, v2]);
    assert.equal(remarksForPoint(p, "chest"), "shorten 2cm");
    assert.equal(remarksForPoint(p, "missing"), null);
  });
});

describe("pattern sheet-wide measurement edits", () => {
  it("adds, renames, reorders, and removes a point on every trial", () => {
    const start = pattern([version(1), version(2)]);
    const withSleeve = addPointToAllVersions(start, "Sleeve");
    assert.ok(withSleeve);
    assert.deepEqual(
      trialSheetPoints(withSleeve).map((p) => p.point_id),
      ["chest", "sleeve"]
    );
    assert.equal(withSleeve.versions[0]!.measurements.length, 2);
    assert.equal(withSleeve.versions[1]!.measurements.length, 2);

    const renamed = renamePointOnAllVersions(withSleeve, "sleeve", "Sleeve length");
    assert.equal(
      renamed.versions.every((v) =>
        v.measurements.some((m) => m.point_id === "sleeve" && m.name === "Sleeve length")
      ),
      true
    );

    const moved = movePointOnAllVersions(renamed, "sleeve", -1);
    assert.deepEqual(
      trialSheetPoints(moved).map((p) => p.point_id),
      ["sleeve", "chest"]
    );

    const removed = removePointFromAllVersions(moved, "chest");
    assert.deepEqual(
      trialSheetPoints(removed).map((p) => p.point_id),
      ["sleeve"]
    );
    assert.equal(removed.versions.every((v) => v.measurements.length === 1), true);
  });

  it("creates a missing row when patching Sample across trials", () => {
    const v1 = version(1);
    const v2 = version(2);
    v2.measurements = [];
    const p = pattern([v1, v2]);
    const next = patchPointOnAllVersions(p, "chest", { base_value: 42 });
    assert.equal(
      next.versions[0]!.measurements.find((m) => m.point_id === "chest")?.base_value,
      42
    );
    assert.equal(
      next.versions[1]!.measurements.find((m) => m.point_id === "chest")?.base_value,
      42
    );
  });
});
