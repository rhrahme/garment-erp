import assert from "node:assert/strict";
import { test } from "node:test";
import {
  convertMeasurementRowUnit,
  convertMeasurementUnit,
  convertMeasurementValueMap,
  formatMeasurementForDisplay,
  unitLabel,
} from "@/lib/pattern-library/measurements";
import {
  parseMeasurementUnit,
  withMeasurementUnitParam,
} from "@/lib/pattern-library/measurement-unit-preference";
import type { ClientPatternMeasurement } from "@/lib/types/pattern-library";

function row(
  values: Partial<
    Pick<
      ClientPatternMeasurement,
      "base_value" | "target_value" | "sewn_value" | "adjustment"
    >
  > = {}
): ClientPatternMeasurement {
  return {
    point_id: "chest",
    name: "Chest",
    remark: null,
    is_graded: true,
    base_value: values.base_value ?? null,
    target_value: values.target_value ?? null,
    sewn_value: values.sewn_value ?? null,
    adjustment: values.adjustment ?? null,
    remarks: null,
  };
}

test("unitLabel maps in to inches", () => {
  assert.equal(unitLabel("cm"), "cm");
  assert.equal(unitLabel("in"), "inches");
});

test("convertMeasurementUnit rounds to sheet precision", () => {
  assert.equal(convertMeasurementUnit(56, "cm", "in"), 22.0625);
  assert.equal(convertMeasurementUnit(22, "in", "cm"), 55.88);
  assert.equal(convertMeasurementUnit(10, "cm", "cm"), 10);
});

test("convertMeasurementRowUnit converts every numeric cell", () => {
  const converted = convertMeasurementRowUnit(
    row({
      base_value: 58.625,
      target_value: 58,
      sewn_value: 57.5,
      adjustment: 0.125,
    }),
    "in",
    "cm"
  );
  assert.equal(converted.base_value, 148.91);
  assert.equal(converted.target_value, 147.32);
  assert.equal(converted.sewn_value, 146.05);
  assert.equal(converted.adjustment, 0.32);
  assert.equal(converted.name, "Chest");
});

test("convertMeasurementRowUnit leaves nulls and same-unit rows alone", () => {
  const source = row({ base_value: 40, target_value: null });
  assert.equal(convertMeasurementRowUnit(source, "cm", "cm"), source);
  const converted = convertMeasurementRowUnit(source, "cm", "in");
  assert.equal(converted.base_value, 15.75);
  assert.equal(converted.target_value, null);
});

test("convertMeasurementValueMap converts size cells", () => {
  const next = convertMeasurementValueMap({ M: 56, L: null }, "cm", "in");
  assert.equal(next.M, 22.0625);
  assert.equal(next.L, null);
});

test("formatMeasurementForDisplay converts then formats", () => {
  assert.equal(formatMeasurementForDisplay(1, "in", "cm"), "2.54");
});

test("parseMeasurementUnit and withMeasurementUnitParam", () => {
  assert.equal(parseMeasurementUnit("cm"), "cm");
  assert.equal(parseMeasurementUnit("nope"), null);
  assert.equal(
    withMeasurementUnitParam("/pattern/x/print?sheet=production", "cm"),
    "/pattern/x/print?sheet=production&unit=cm"
  );
});
