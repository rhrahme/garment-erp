import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONSOLIDATE_FABRICS_HOWTO_BODY,
  CONSOLIDATE_FABRICS_HOWTO_NOTICE_ID,
  CONSOLIDATE_FABRICS_HOWTO_TITLE,
  PATTERN_HOWTO_NOTICES,
  CONSOLIDATE_REMOVED_SO_LINES_HOWTO_BODY,
  CONSOLIDATE_REMOVED_SO_LINES_HOWTO_NOTICE_ID,
  CONSOLIDATE_REMOVED_SO_LINES_HOWTO_TITLE,
  REMOVE_FABRIC_FROM_CONSOLIDATION_HOWTO_BODY,
  REMOVE_FABRIC_FROM_CONSOLIDATION_HOWTO_NOTICE_ID,
  REMOVE_FABRIC_FROM_CONSOLIDATION_HOWTO_TITLE,
} from "@/lib/pattern/pattern-operator-notice-copy";

describe("Pattern leftover-SO-line consolidate how-to", () => {
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
    assert.equal(PATTERN_HOWTO_NOTICES[0]?.id, CONSOLIDATE_REMOVED_SO_LINES_HOWTO_NOTICE_ID);
  });
});
