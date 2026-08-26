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
  PATTERN_FILES_BY_BRAND_HOWTO_BODY,
  PATTERN_FILES_BY_BRAND_HOWTO_NOTICE_ID,
  PATTERN_FILES_BY_BRAND_HOWTO_TITLE,
  SAME_QUEUE_ALL_BRANDS_HOWTO_BODY,
  SAME_QUEUE_ALL_BRANDS_HOWTO_NOTICE_ID,
  SAME_QUEUE_ALL_BRANDS_HOWTO_TITLE,
  FABRIC_SPEC_BOTH_ACCOUNTS_HOWTO_BODY,
  FABRIC_SPEC_BOTH_ACCOUNTS_HOWTO_NOTICE_ID,
  FABRIC_SPEC_BOTH_ACCOUNTS_HOWTO_TITLE,
  OVERSHIRT_WAIST_NOT_TROUSER_HOWTO_BODY,
  OVERSHIRT_WAIST_NOT_TROUSER_HOWTO_NOTICE_ID,
  OVERSHIRT_WAIST_NOT_TROUSER_HOWTO_TITLE,
  PRINT_HOWTO_KEEP_PAPER_BODY,
  PRINT_HOWTO_KEEP_PAPER_NOTICE_ID,
  PRINT_HOWTO_KEEP_PAPER_TITLE,
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
    assert.ok(ids.includes(PATTERN_FILES_BY_BRAND_HOWTO_NOTICE_ID));
    assert.ok(ids.includes(PRINT_HOWTO_KEEP_PAPER_NOTICE_ID));
    assert.ok(ids.includes(OVERSHIRT_WAIST_NOT_TROUSER_HOWTO_NOTICE_ID));
    assert.ok(ids.includes(FABRIC_SPEC_BOTH_ACCOUNTS_HOWTO_NOTICE_ID));
    assert.ok(ids.includes(SAME_QUEUE_ALL_BRANDS_HOWTO_NOTICE_ID));
    assert.equal(
      PATTERN_HOWTO_NOTICES[0]?.id,
      SAME_QUEUE_ALL_BRANDS_HOWTO_NOTICE_ID
    );
  });
});

describe("Pattern same queue All brands", () => {
  it("tells Pattern both logins share one list and to tap All brands", () => {
    assert.equal(
      SAME_QUEUE_ALL_BRANDS_HOWTO_NOTICE_ID,
      "howto-same-queue-all-brands-v1"
    );
    assert.match(SAME_QUEUE_ALL_BRANDS_HOWTO_TITLE, /All brands/);
    assert.match(SAME_QUEUE_ALL_BRANDS_HOWTO_BODY, /one client list/);
    assert.match(SAME_QUEUE_ALL_BRANDS_HOWTO_BODY, /New \(8\)/);
    assert.match(SAME_QUEUE_ALL_BRANDS_HOWTO_BODY, /filter/);
  });
});

describe("Pattern fabric spec both accounts", () => {
  it("tells Pattern Fabric Specification is on the left menu and prices stay hidden", () => {
    assert.equal(
      FABRIC_SPEC_BOTH_ACCOUNTS_HOWTO_NOTICE_ID,
      "howto-fabric-spec-both-accounts-v1"
    );
    assert.match(FABRIC_SPEC_BOTH_ACCOUNTS_HOWTO_TITLE, /Fabric Specification/);
    assert.match(FABRIC_SPEC_BOTH_ACCOUNTS_HOWTO_BODY, /Left menu/);
    assert.match(FABRIC_SPEC_BOTH_ACCOUNTS_HOWTO_BODY, /prices stay hidden/i);
    assert.match(FABRIC_SPEC_BOTH_ACCOUNTS_HOWTO_BODY, /does not see list prices/);
  });
});

describe("Pattern overshirt 1/2 Waist is not Trouser waist", () => {
  it("tells Pattern Overshirt 1/2 Waist stays off Trouser", () => {
    assert.equal(
      OVERSHIRT_WAIST_NOT_TROUSER_HOWTO_NOTICE_ID,
      "howto-overshirt-waist-not-trouser-v1"
    );
    assert.match(OVERSHIRT_WAIST_NOT_TROUSER_HOWTO_TITLE, /1\/2 Waist/);
    assert.match(OVERSHIRT_WAIST_NOT_TROUSER_HOWTO_BODY, /Overshirt/);
    assert.match(OVERSHIRT_WAIST_NOT_TROUSER_HOWTO_BODY, /Waist Relax/);
    assert.match(OVERSHIRT_WAIST_NOT_TROUSER_HOWTO_BODY, /does not go to Trouser/);
  });
});

describe("Pattern print how-to keep paper", () => {
  it("tells Pattern to print How-to and keep the paper at the desk", () => {
    assert.equal(PRINT_HOWTO_KEEP_PAPER_NOTICE_ID, "howto-print-howto-keep-paper-v1");
    assert.match(PRINT_HOWTO_KEEP_PAPER_TITLE, /Print How-to/);
    assert.match(PRINT_HOWTO_KEEP_PAPER_BODY, /Print all how-tos/);
    assert.match(PRINT_HOWTO_KEEP_PAPER_BODY, /A4 portrait/);
    assert.match(PRINT_HOWTO_KEEP_PAPER_BODY, /Pattern desk/);
    assert.match(PRINT_HOWTO_KEEP_PAPER_BODY, /got lost/);
  });

  it("puts Print on the How-to tab and the Pattern banner", () => {
    const tab = readFileSync("src/components/pattern/PatternHowToTab.tsx", "utf8");
    const banner = readFileSync("src/components/pattern/PatternOperatorNoticesPanel.tsx", "utf8");
    assert.match(tab, /\/pattern\/how-to\/print/);
    assert.match(tab, /Print all how-tos/);
    assert.match(tab, /Print this/);
    assert.match(banner, /\/pattern\/how-to\/print/);
    assert.match(banner, /Print all how-tos/);
    assert.match(banner, /Print this/);
  });
});

describe("Pattern add-to-existing-consolidation how-to", () => {
  it("teaches linking new fabrics onto the first grouped sheet", () => {
    assert.equal(
      ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_NOTICE_ID,
      "howto-add-fabrics-to-existing-consolidation-v2"
    );
    assert.match(ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_TITLE, /same pattern/i);
    assert.match(ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_TITLE, /Not a new pattern/);
    assert.match(ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_BODY, /extra fabrics/);
    assert.match(ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_BODY, /Same pattern/);
    assert.match(ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_BODY, /Add to this pattern/);
    assert.match(ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_BODY, /Do not press New pattern/);
  });

  it("teaches Pattern -> Files to scan TUD DXF RUL by brand", () => {
    assert.equal(PATTERN_FILES_BY_BRAND_HOWTO_NOTICE_ID, "howto-pattern-files-by-brand-v1");
    assert.match(PATTERN_FILES_BY_BRAND_HOWTO_TITLE, /Files/);
    assert.match(PATTERN_FILES_BY_BRAND_HOWTO_BODY, /grouped by brand/);
    assert.match(PATTERN_FILES_BY_BRAND_HOWTO_BODY, /TUD is required/);
    assert.match(PATTERN_FILES_BY_BRAND_HOWTO_BODY, /Open Files|Press Open/);
  });

  it("shows open how-tos on every Pattern page, not only email or Queue home", () => {
    const layout = readFileSync("src/app/(dashboard)/pattern/layout.tsx", "utf8");
    const home = readFileSync("src/app/(dashboard)/pattern/page.tsx", "utf8");
    assert.match(layout, /PatternOperatorNoticesPanel/);
    assert.doesNotMatch(home, /PatternOperatorNoticesPanel/);
  });
});
