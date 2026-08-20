import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  ADD_TO_EXISTING_CONSOLIDATION_BOARD_HINT_BODY,
  ADD_TO_EXISTING_CONSOLIDATION_MODAL_HINT,
  defaultConsolidateMode,
} from "@/lib/pattern/add-to-existing-consolidation-ui";

describe("add extra fabrics to an existing consolidation UI", () => {
  it("opens Same pattern when this garment already has a sheet", () => {
    assert.equal(defaultConsolidateMode(true), "existing");
    assert.equal(defaultConsolidateMode(false), "new");
  });

  it("puts Same pattern on the consolidate box they actually click", () => {
    const modal = readFileSync("src/components/pattern/ConsolidateSelectedFabricsModal.tsx", "utf8");
    const board = readFileSync("src/components/pattern/PatternOrderBoard.tsx", "utf8");
    assert.match(modal, /Same pattern/);
    assert.match(modal, /Add to this pattern/);
    assert.match(modal, /Not a new pattern/);
    assert.match(modal, /defaultConsolidateMode\(alreadyHasSheet\)/);
    assert.match(board, /ADD_TO_EXISTING_CONSOLIDATION_BOARD_HINT_TITLE/);
  });

  it("says more fabrics on the same pattern, not a new pattern", () => {
    assert.match(ADD_TO_EXISTING_CONSOLIDATION_BOARD_HINT_BODY, /extra fabrics/);
    assert.match(ADD_TO_EXISTING_CONSOLIDATION_BOARD_HINT_BODY, /not a new pattern/i);
    assert.match(ADD_TO_EXISTING_CONSOLIDATION_MODAL_HINT, /already made/);
    assert.match(ADD_TO_EXISTING_CONSOLIDATION_MODAL_HINT, /Not a new pattern/);
  });
});
