import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONSOLIDATE_FABRICS_HOWTO_BODY,
  CONSOLIDATE_FABRICS_HOWTO_NOTICE_ID,
  CONSOLIDATE_FABRICS_HOWTO_TITLE,
} from "@/lib/pattern/pattern-operator-notice-copy";

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
