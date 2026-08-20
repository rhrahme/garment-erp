import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_BODY,
  ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_NOTICE_ID,
  ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_TITLE,
  CONSOLIDATE_FABRICS_HOWTO_BODY,
  CONSOLIDATE_FABRICS_HOWTO_NOTICE_ID,
  CONSOLIDATE_FABRICS_HOWTO_TITLE,
  PATTERN_HOWTO_NOTICES,
  CONSOLIDATE_REMOVED_SO_LINES_HOWTO_BODY,
  CONSOLIDATE_REMOVED_SO_LINES_HOWTO_NOTICE_ID,
  CONSOLIDATE_REMOVED_SO_LINES_HOWTO_TITLE,
  ERP_SOURCE_OF_TRUTH_LEFTOVER_JOBS_HOWTO_BODY,
  ERP_SOURCE_OF_TRUTH_LEFTOVER_JOBS_HOWTO_NOTICE_ID,
  ERP_SOURCE_OF_TRUTH_LEFTOVER_JOBS_HOWTO_TITLE,
  REMOVE_FABRIC_FROM_CONSOLIDATION_HOWTO_BODY,
  REMOVE_FABRIC_FROM_CONSOLIDATION_HOWTO_NOTICE_ID,
  REMOVE_FABRIC_FROM_CONSOLIDATION_HOWTO_TITLE,
} from "@/lib/pattern/pattern-operator-notice-copy";

describe("Pattern leftover-SO-line consolidate how-to", () => {
  it("tells Pattern leftover jobs are cleared because ERP is the source of truth", () => {
    assert.equal(
      ERP_SOURCE_OF_TRUTH_LEFTOVER_JOBS_HOWTO_NOTICE_ID,
      "howto-erp-source-of-truth-leftover-jobs-v1"
    );
    assert.match(ERP_SOURCE_OF_TRUTH_LEFTOVER_JOBS_HOWTO_TITLE, /leftover/i);
    assert.match(ERP_SOURCE_OF_TRUTH_LEFTOVER_JOBS_HOWTO_BODY, /not using ClickUp/i);
    assert.match(ERP_SOURCE_OF_TRUTH_LEFTOVER_JOBS_HOWTO_BODY, /source of truth/i);
    assert.match(ERP_SOURCE_OF_TRUTH_LEFTOVER_JOBS_HOWTO_BODY, /Consolidate selected/);
  });

  it("tells Pattern to skip fabrics QC removed from the order", () => {
    assert.equal(
      CONSOLIDATE_REMOVED_SO_LINES_HOWTO_NOTICE_ID,
      "howto-consolidate-removed-so-lines-v1"
    );
    assert.match(CONSOLIDATE_REMOVED_SO_LINES_HOWTO_TITLE, /not found/i);
    assert.match(CONSOLIDATE_REMOVED_SO_LINES_HOWTO_BODY, /Removed from this sales order/);
    assert.match(CONSOLIDATE_REMOVED_SO_LINES_HOWTO_BODY, /Select all/);
    assert.match(CONSOLIDATE_REMOVED_SO_LINES_HOWTO_BODY, /QC/);
  });
});

describe("Pattern consolidate how-to notice", () => {
  it("teaches consolidate selected then create or link pattern", () => {
    assert.equal(CONSOLIDATE_FABRICS_HOWTO_NOTICE_ID, "howto-consolidate-fabrics-v1");
    assert.match(CONSOLIDATE_FABRICS_HOWTO_TITLE, /consolidat/i);
    assert.match(CONSOLIDATE_FABRICS_HOWTO_BODY, /Consolidate selected/);
    assert.match(CONSOLIDATE_FABRICS_HOWTO_BODY, /Create pattern/);
    assert.match(CONSOLIDATE_FABRICS_HOWTO_BODY, /Link & open pattern/);
    assert.match(CONSOLIDATE_FABRICS_HOWTO_BODY, /Auto-consolidate/);
    assert.match(CONSOLIDATE_FABRICS_HOWTO_BODY, /\.TUD/);
  });
});

describe("Pattern remove-from-consolidation how-to", () => {
  it("teaches Grouped fabrics Remove and keeps the fabric on the order", () => {
    assert.equal(
      REMOVE_FABRIC_FROM_CONSOLIDATION_HOWTO_NOTICE_ID,
      "howto-remove-fabric-from-consolidation-v1"
    );
    assert.match(REMOVE_FABRIC_FROM_CONSOLIDATION_HOWTO_TITLE, /remove/i);
    assert.match(REMOVE_FABRIC_FROM_CONSOLIDATION_HOWTO_BODY, /Grouped fabrics/);
    assert.match(REMOVE_FABRIC_FROM_CONSOLIDATION_HOWTO_BODY, /Remove/);
    assert.match(REMOVE_FABRIC_FROM_CONSOLIDATION_HOWTO_BODY, /stays on the sales order/);
    assert.match(REMOVE_FABRIC_FROM_CONSOLIDATION_HOWTO_BODY, /Client fabric board/);
  });

  it("keeps every catalog how-to on the How-to tab list", () => {
    const ids = PATTERN_HOWTO_NOTICES.map((howto) => howto.id);
    assert.ok(ids.includes(CONSOLIDATE_FABRICS_HOWTO_NOTICE_ID));
    assert.ok(ids.includes(REMOVE_FABRIC_FROM_CONSOLIDATION_HOWTO_NOTICE_ID));
    assert.ok(ids.includes(CONSOLIDATE_REMOVED_SO_LINES_HOWTO_NOTICE_ID));
    assert.ok(ids.includes(ERP_SOURCE_OF_TRUTH_LEFTOVER_JOBS_HOWTO_NOTICE_ID));
    assert.ok(ids.includes(ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_NOTICE_ID));
    assert.equal(
      PATTERN_HOWTO_NOTICES[0]?.id,
      ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_NOTICE_ID
    );
  });
});

describe("Pattern add-to-existing-consolidation how-to", () => {
  it("teaches linking new fabrics onto the first grouped sheet", () => {
    assert.equal(
      ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_NOTICE_ID,
      "howto-add-fabrics-to-existing-consolidation-v2"
    );
    assert.match(ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_TITLE, /SAME pattern/i);
    assert.match(ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_BODY, /WRONG/);
    assert.match(ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_BODY, /Existing pattern/);
    assert.match(ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_BODY, /Link & open pattern/);
    assert.match(ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_BODY, /ONLY the new fabrics/);
    assert.match(ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_BODY, /Do not press New pattern/);
    assert.match(ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_BODY, /Do not make a second pattern/);
  });

  it("shows open how-tos on every Pattern page, not only email or Queue home", () => {
    const layout = readFileSync("src/app/(dashboard)/pattern/layout.tsx", "utf8");
    const home = readFileSync("src/app/(dashboard)/pattern/page.tsx", "utf8");
    assert.match(layout, /PatternOperatorNoticesPanel/);
    assert.doesNotMatch(home, /PatternOperatorNoticesPanel/);
  });
});
