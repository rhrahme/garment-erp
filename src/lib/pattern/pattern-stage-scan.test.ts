import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPatternScanStation,
  PATTERN_SCAN_STATIONS,
  planPatternScan,
} from "./pattern-stage-scan-plan.ts";

describe("pattern stage scan stations", () => {
  it("lists the four Pattern flow stations", () => {
    assert.deepEqual([...PATTERN_SCAN_STATIONS], [
      "pattern_tud_ready",
      "pattern_sheet_filled",
      "pattern_handed_to_cut",
      "pattern_trial_done",
    ]);
  });

  it("recognizes pattern stations and rejects production ones", () => {
    assert.equal(isPatternScanStation("pattern_tud_ready"), true);
    assert.equal(isPatternScanStation("pattern_handed_to_cut"), true);
    assert.equal(isPatternScanStation("cutting"), false);
    assert.equal(isPatternScanStation("sewing"), false);
  });

  it("maps TUD ready / sheet filled / handed to cut / trial done", () => {
    const tud = planPatternScan("pattern_tud_ready", "pending");
    assert.equal(tud.kind, "advance");
    if (tud.kind === "advance") assert.equal(tud.status, "drafting");

    const sheet = planPatternScan("pattern_sheet_filled", "drafting");
    assert.equal(sheet.kind, "advance");
    if (sheet.kind === "advance") assert.equal(sheet.status, "awaiting_fitting");

    const handed = planPatternScan("pattern_handed_to_cut", "awaiting_fitting");
    assert.equal(handed.kind, "advance");
    if (handed.kind === "advance") assert.equal(handed.status, "ready_for_cutting");

    const trial = planPatternScan("pattern_trial_done", "revising");
    assert.equal(trial.kind, "advance");
    if (trial.kind === "advance") assert.equal(trial.status, "drafting");

    assert.equal(planPatternScan("pattern_handed_to_cut", "ready_for_cutting").kind, "check_in");
    assert.equal(planPatternScan("pattern_tud_ready", "cancelled").kind, "reject");
  });
});
