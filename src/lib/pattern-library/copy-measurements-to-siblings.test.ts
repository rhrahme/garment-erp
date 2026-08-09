import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyCopyMeasurementsToPattern,
  listCopyMeasurementSiblings,
} from "@/lib/pattern-library/copy-measurements-to-siblings";
import type { ClientPattern, ClientPatternVersion } from "@/lib/types/pattern-library";

function version(
  id: string,
  values: Array<{ id: string; name: string; target: number | null }>
): ClientPatternVersion {
  return {
    id,
    version: 1,
    is_final: false,
    trial_date: null,
    measurements: values.map((row) => ({
      point_id: row.id,
      name: row.name,
      remark: null,
      is_graded: true,
      base_value: null,
      target_value: row.target,
      sewn_value: null,
      adjustment: null,
      remarks: null,
    })),
    special_instructions: "Crosspocket",
    notes: null,
    files: [],
    created_by: null,
    updated_by: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  };
}

function pattern(
  id: string,
  ref: string,
  opts: {
    fabric?: string;
    unit?: "cm" | "in";
    values?: Array<{ id: string; name: string; target: number | null }>;
    linked?: number;
  } = {}
): ClientPattern {
  return {
    id,
    pattern_ref: ref,
    client_id: "client-1",
    client_code: "FR-0001",
    client_name: "Test",
    garment_type: "Overshirt+Trouser",
    unit: opts.unit ?? "cm",
    base_pattern_id: null,
    base_size: null,
    fabric: opts.fabric ?? null,
    house_brand_id: null,
    house_brand_code: null,
    description: null,
    notes: opts.fabric ? `Auto-consolidated: ${opts.fabric}` : null,
    special_instructions: null,
    physical_pattern_kept: false,
    physical_pattern_location: null,
    final_version_id: null,
    linked_fabric_line_ids: Array.from({ length: opts.linked ?? 0 }, (_, i) => `line-${i}`),
    files: [],
    versions: [
      version(
        `${id}-v1`,
        opts.values ?? [{ id: "total-length-hnp", name: "Total Length (HNP)", target: null }]
      ),
    ],
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  };
}

test("listCopyMeasurementSiblings returns same client+garment only", () => {
  const source = pattern("src", "SRC", {
    fabric: "SUMMERTIME 250",
    values: [{ id: "total-length-hnp", name: "Total Length (HNP)", target: 76 }],
    linked: 17,
  });
  const same = pattern("a", "A", { fabric: "NOBEL", linked: 6 });
  const otherGarment = {
    ...pattern("b", "B"),
    garment_type: "Shirt LS",
  };
  const otherClient = { ...pattern("c", "C"), client_id: "other" };
  const siblings = listCopyMeasurementSiblings(
    [source, same, otherGarment, otherClient],
    source
  );
  assert.deepEqual(
    siblings.map((row) => row.id),
    ["a"]
  );
  assert.equal(siblings[0]?.linked_fabric_count, 6);
  assert.equal(siblings[0]?.is_empty, true);
});

test("overwrite copies cm sizes and unit onto sibling", () => {
  const source = pattern("src", "SRC", {
    unit: "cm",
    values: [
      { id: "total-length-hnp", name: "Total Length (HNP)", target: 76 },
      { id: "1-2-chest", name: "1/2 Chest", target: 63 },
    ],
  });
  const target = pattern("tgt", "TGT", {
    unit: "in",
    values: [{ id: "total-length-hnp", name: "Total Length (HNP)", target: 30 }],
  });
  const next = applyCopyMeasurementsToPattern(target, source, "overwrite");
  assert.ok(next);
  assert.equal(next!.unit, "cm");
  assert.equal(next!.versions[0]!.measurements[0]!.target_value, 76);
  assert.equal(next!.versions[0]!.measurements[1]!.target_value, 63);
  assert.equal(next!.versions[0]!.special_instructions, "Crosspocket");
});

test("fill_empty_only skips sheets that already have sizes", () => {
  const source = pattern("src", "SRC", {
    values: [{ id: "total-length-hnp", name: "Total Length (HNP)", target: 76 }],
  });
  const filled = pattern("tgt", "TGT", {
    values: [{ id: "total-length-hnp", name: "Total Length (HNP)", target: 70 }],
  });
  assert.equal(applyCopyMeasurementsToPattern(filled, source, "fill_empty_only"), null);
});
