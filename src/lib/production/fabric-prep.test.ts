import assert from "node:assert/strict";
import { test } from "node:test";
import {
  completeFabricPrepActionLabel,
  fabricPrepStepLabel,
  firstFabricPrepStep,
  nextFabricPrepStep,
} from "./fabric-prep.ts";

test("wash_iron lifecycle: wash → drying → iron → done", () => {
  assert.equal(firstFabricPrepStep("wash_iron"), "wash");
  assert.equal(nextFabricPrepStep("wash_iron", "wash"), "drying");
  assert.equal(nextFabricPrepStep("wash_iron", "drying"), "iron");
  assert.equal(nextFabricPrepStep("wash_iron", "iron"), null);
});

test("soak_iron lifecycle: soak → drying → iron → done", () => {
  assert.equal(firstFabricPrepStep("soak_iron"), "soak");
  assert.equal(nextFabricPrepStep("soak_iron", "soak"), "drying");
  assert.equal(nextFabricPrepStep("soak_iron", "drying"), "iron");
  assert.equal(nextFabricPrepStep("soak_iron", "iron"), null);
});

test("iron_only lifecycle: iron → done (no wash/soak/dry)", () => {
  assert.equal(firstFabricPrepStep("iron_only"), "iron");
  assert.equal(nextFabricPrepStep("iron_only", "iron"), null);
});

test("step labels and one-tap action labels cover drying", () => {
  assert.equal(fabricPrepStepLabel("drying"), "Drying");
  assert.equal(completeFabricPrepActionLabel("wash_iron", "wash"), "Finish wash → hang to dry");
  assert.equal(completeFabricPrepActionLabel("soak_iron", "soak"), "Finish soak → hang to dry");
  assert.equal(completeFabricPrepActionLabel("wash_iron", "drying"), "Dry done → start ironing");
  assert.equal(
    completeFabricPrepActionLabel("wash_iron", "iron"),
    "Finish ironing → ready for cutting"
  );
});
