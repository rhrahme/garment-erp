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
  READY_MADE_SIZE_RUN_HOWTO_BODY,
  SENT_STITCHED_GARMENT_HOWTO_NOTICE_ID,
  SENT_STITCHED_GARMENT_HOWTO_TITLE,
  SENT_STITCHED_GARMENT_HOWTO_BODY,
  HERE_WALL_ATTENDANCE_HOWTO_NOTICE_ID,
  HERE_WALL_ATTENDANCE_HOWTO_TITLE,
  HERE_WALL_ATTENDANCE_HOWTO_BODY,
  WALL_ATTENDANCE_QR_HOWTO_NOTICE_ID,
  WALL_ATTENDANCE_QR_HOWTO_TITLE,
  WALL_ATTENDANCE_QR_HOWTO_BODY,
  WALL_ATTENDANCE_QR_HOWTO_V2_NOTICE_ID,
  WALL_ATTENDANCE_QR_HOWTO_V2_TITLE,
  WALL_ATTENDANCE_QR_HOWTO_V2_BODY,
  WALL_ATTENDANCE_QR_HOWTO_V3_NOTICE_ID,
  WALL_ATTENDANCE_QR_HOWTO_V3_TITLE,
  WALL_ATTENDANCE_QR_HOWTO_V3_BODY,
  STITCH_PIECE_A4_HOWTO_NOTICE_ID,
  STITCH_PIECE_A4_HOWTO_TITLE,
  STITCH_PIECE_A4_HOWTO_BODY,
  PRINT_SEWING_A4_FROM_PATTERN_HOWTO_NOTICE_ID,
  PRINT_SEWING_A4_FROM_PATTERN_HOWTO_TITLE,
  PRINT_SEWING_A4_FROM_PATTERN_HOWTO_BODY,
  COPY_BASE_TO_BRAND_HOWTO_NOTICE_ID,
  COPY_BASE_TO_BRAND_HOWTO_TITLE,
  COPY_BASE_TO_BRAND_HOWTO_BODY,
  CLIENT_SAMPLE_GARMENT_HOWTO_NOTICE_ID,
  CLIENT_SAMPLE_GARMENT_HOWTO_TITLE,
  CLIENT_SAMPLE_GARMENT_HOWTO_BODY,
  BOGGI_BRAND_FOLDER_HOWTO_NOTICE_ID,
  BOGGI_BRAND_FOLDER_HOWTO_TITLE,
  BOGGI_BRAND_FOLDER_HOWTO_BODY,
  CORRECT_START_TIME_HOWTO_NOTICE_ID,
  CORRECT_START_TIME_HOWTO_TITLE,
  CORRECT_START_TIME_HOWTO_BODY,
  READY_MADE_SIZE_RUN_HOWTO_NOTICE_ID,
  READY_MADE_SIZE_RUN_HOWTO_TITLE,
  SEARCH_ACROSS_BRANDS_HOWTO_BODY,
  SEARCH_ACROSS_BRANDS_HOWTO_NOTICE_ID,
  SEARCH_ACROSS_BRANDS_HOWTO_TITLE,
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
    assert.ok(ids.includes(SEARCH_ACROSS_BRANDS_HOWTO_NOTICE_ID));
    assert.ok(ids.includes(READY_MADE_SIZE_RUN_HOWTO_NOTICE_ID));
    assert.ok(ids.includes(CORRECT_START_TIME_HOWTO_NOTICE_ID));
    assert.ok(ids.includes(BOGGI_BRAND_FOLDER_HOWTO_NOTICE_ID));
    assert.ok(ids.includes(CLIENT_SAMPLE_GARMENT_HOWTO_NOTICE_ID));
    assert.ok(ids.includes(SENT_STITCHED_GARMENT_HOWTO_NOTICE_ID));
    assert.ok(ids.includes(COPY_BASE_TO_BRAND_HOWTO_NOTICE_ID));
    assert.ok(ids.includes(WALL_ATTENDANCE_QR_HOWTO_V3_NOTICE_ID));
    assert.ok(ids.includes(STITCH_PIECE_A4_HOWTO_NOTICE_ID));
    assert.ok(ids.includes(PRINT_SEWING_A4_FROM_PATTERN_HOWTO_NOTICE_ID));
    assert.equal(!ids.includes(WALL_ATTENDANCE_QR_HOWTO_NOTICE_ID), true);
    assert.equal(!ids.includes(WALL_ATTENDANCE_QR_HOWTO_V2_NOTICE_ID), true);
    assert.equal(PATTERN_HOWTO_NOTICES[0]?.id, PRINT_SEWING_A4_FROM_PATTERN_HOWTO_NOTICE_ID);
    assert.equal(PATTERN_HOWTO_NOTICES[1]?.id, STITCH_PIECE_A4_HOWTO_NOTICE_ID);
  });
});

describe("Pattern/QC sent stitched garment how-to", () => {
  it("tells QC to mark Sent with factory or client driver, in English and Bangla", () => {
    assert.equal(SENT_STITCHED_GARMENT_HOWTO_NOTICE_ID, "howto-sent-stitched-garment-v2");
    assert.match(SENT_STITCHED_GARMENT_HOWTO_TITLE, /factory driver|client driver/i);
    assert.match(SENT_STITCHED_GARMENT_HOWTO_BODY, /Handed to factory driver/);
    assert.match(SENT_STITCHED_GARMENT_HOWTO_BODY, /proof photo/i);
    assert.match(SENT_STITCHED_GARMENT_HOWTO_BODY, /dropdown/i);
    assert.match(SENT_STITCHED_GARMENT_HOWTO_BODY, /Packed|packed/);
    assert.match(SENT_STITCHED_GARMENT_HOWTO_BODY, /ENGLISH/);
    assert.match(SENT_STITCHED_GARMENT_HOWTO_BODY, /BANGLA/);
  });

  it("emails every team and stays on How-to in each ERP account after Got it", () => {
    const howto = PATTERN_HOWTO_NOTICES.find(
      (row) => row.id === SENT_STITCHED_GARMENT_HOWTO_NOTICE_ID
    );
    assert.equal(howto?.audience, "all_teams");
    const actions = readFileSync("src/lib/pattern/pattern-operator-notice-actions.ts", "utf8");
    assert.match(actions, /parseAllTeamNoticeEmails/);
    assert.match(actions, /ERP all teams/);
    assert.match(actions, /how-tos stay on How-to in your ERP account/);
    const shell = readFileSync("src/components/layout/DashboardShell.tsx", "utf8");
    assert.match(shell, /TeamHowToBanner/);
    const sidebar = readFileSync("src/components/layout/Sidebar.tsx", "utf8");
    assert.match(sidebar, /href: \"\/how-to\"/);
    const banner = readFileSync("src/components/layout/TeamHowToBanner.tsx", "utf8");
    assert.match(banner, /href=\"\/how-to\"/);
    assert.match(banner, /pathname.startsWith\(\"\/how-to\"\)/);
    const tab = readFileSync("src/components/layout/TeamHowToTab.tsx", "utf8");
    assert.match(tab, /audience === \"all_teams\"/);
    const page = readFileSync("src/app/(dashboard)/how-to/page.tsx", "utf8");
    assert.match(page, /TeamHowToTab/);
  });
});

describe("HERE wall attendance how-to", () => {
  it("keeps the first HERE copy for already-emailed notices", () => {
    assert.equal(HERE_WALL_ATTENDANCE_HOWTO_NOTICE_ID, "howto-here-wall-attendance-v1");
    assert.match(HERE_WALL_ATTENDANCE_HOWTO_TITLE, /HERE poster/i);
    assert.match(HERE_WALL_ATTENDANCE_HOWTO_BODY, /Scan the HERE poster/);
    assert.match(HERE_WALL_ATTENDANCE_HOWTO_BODY, /does not start or finish a piece/i);
  });
});

describe("print Sewing A4 from Pattern how-to", () => {
  it("tells Pattern to print Sewing A4s with the floor QR, not the pattern library QR", () => {
    assert.equal(
      PRINT_SEWING_A4_FROM_PATTERN_HOWTO_NOTICE_ID,
      "howto-print-sewing-a4-from-pattern-v1"
    );
    assert.match(PRINT_SEWING_A4_FROM_PATTERN_HOWTO_TITLE, /Sewing A4s/i);
    assert.match(PRINT_SEWING_A4_FROM_PATTERN_HOWTO_BODY, /size 52/);
    assert.match(PRINT_SEWING_A4_FROM_PATTERN_HOWTO_BODY, /Sewing A4s/);
    assert.match(PRINT_SEWING_A4_FROM_PATTERN_HOWTO_BODY, /Do not print Cutter for the stitcher/);
    assert.match(PRINT_SEWING_A4_FROM_PATTERN_HOWTO_BODY, /pattern library QR/);
    assert.match(PRINT_SEWING_A4_FROM_PATTERN_HOWTO_BODY, /ENGLISH/);
    assert.match(PRINT_SEWING_A4_FROM_PATTERN_HOWTO_BODY, /BANGLA/);
    const howto = PATTERN_HOWTO_NOTICES.find(
      (row) => row.id === PRINT_SEWING_A4_FROM_PATTERN_HOWTO_NOTICE_ID
    );
    assert.equal(howto?.audience, "pattern");
    assert.equal(howto?.href, "/pattern");
  });
});

describe("stitch piece A4 how-to", () => {
  it("tells the floor badge then garment A4, not the pattern QR, in English and Bangla", () => {
    assert.equal(STITCH_PIECE_A4_HOWTO_NOTICE_ID, "howto-stitch-piece-a4-not-pattern-v1");
    assert.match(STITCH_PIECE_A4_HOWTO_TITLE, /A4 on the garment/i);
    assert.match(STITCH_PIECE_A4_HOWTO_BODY, /size 52/);
    assert.match(STITCH_PIECE_A4_HOWTO_BODY, /Do not scan the pattern paper QR/);
    assert.match(STITCH_PIECE_A4_HOWTO_BODY, /FR-0132-L07-JKT-1\/2/);
    assert.match(STITCH_PIECE_A4_HOWTO_BODY, /ENGLISH/);
    assert.match(STITCH_PIECE_A4_HOWTO_BODY, /BANGLA/);
    const howto = PATTERN_HOWTO_NOTICES.find((row) => row.id === STITCH_PIECE_A4_HOWTO_NOTICE_ID);
    assert.equal(howto?.audience, "all_teams");
    assert.equal(howto?.href, "/stitch");
  });
});

describe("wall attendance QR how-to", () => {
  it("keeps the first wall-QR copy for already-emailed notices", () => {
    assert.equal(WALL_ATTENDANCE_QR_HOWTO_NOTICE_ID, "howto-wall-attendance-qr-v1");
    assert.match(WALL_ATTENDANCE_QR_HOWTO_TITLE, /wall QR/i);
    assert.match(WALL_ATTENDANCE_QR_HOWTO_BODY, /Then scan the garment A4 to start work/);
  });

  it("keeps the v2 separate-from-stitching copy for already-emailed notices", () => {
    assert.equal(WALL_ATTENDANCE_QR_HOWTO_V2_NOTICE_ID, "howto-wall-attendance-qr-v2");
    assert.match(WALL_ATTENDANCE_QR_HOWTO_V2_TITLE, /separate from stitching/i);
    assert.match(WALL_ATTENDANCE_QR_HOWTO_V2_BODY, /does not start a piece/);
  });

  it("tells the floor either scan order is registered, in English and Bangla", () => {
    assert.equal(WALL_ATTENDANCE_QR_HOWTO_V3_NOTICE_ID, "howto-wall-attendance-qr-v3");
    assert.match(WALL_ATTENDANCE_QR_HOWTO_V3_TITLE, /either order/i);
    assert.match(WALL_ATTENDANCE_QR_HOWTO_V3_BODY, /Either order is accepted and registered/);
    assert.match(WALL_ATTENDANCE_QR_HOWTO_V3_BODY, /Or scan the wall QR, then your ID badge/);
    assert.match(WALL_ATTENDANCE_QR_HOWTO_V3_BODY, /Scan your ID badge again/);
    assert.match(WALL_ATTENDANCE_QR_HOWTO_V3_BODY, /BANGLA/);
    assert.match(WALL_ATTENDANCE_QR_HOWTO_V3_BODY, /Dui order e register hoy/);
    const howto = PATTERN_HOWTO_NOTICES.find(
      (row) => row.id === WALL_ATTENDANCE_QR_HOWTO_V3_NOTICE_ID
    );
    assert.equal(howto?.audience, "all_teams");
  });
});

describe("Pattern copy base to brand how-to", () => {
  it("tells Pattern how to copy a house base and edit it, in English and Bangla", () => {
    assert.equal(COPY_BASE_TO_BRAND_HOWTO_NOTICE_ID, "howto-copy-base-to-brand-v1");
    assert.match(COPY_BASE_TO_BRAND_HOWTO_TITLE, /copy a pattern/i);
    assert.match(COPY_BASE_TO_BRAND_HOWTO_BODY, /Copy to brand/);
    assert.match(COPY_BASE_TO_BRAND_HOWTO_BODY, /Save changes/);
    assert.match(COPY_BASE_TO_BRAND_HOWTO_BODY, /Load from base pattern/);
    assert.match(COPY_BASE_TO_BRAND_HOWTO_BODY, /BANGLA/);
    const howto = PATTERN_HOWTO_NOTICES.find(
      (row) => row.id === COPY_BASE_TO_BRAND_HOWTO_NOTICE_ID
    );
    assert.equal(howto?.audience, "pattern");
  });
});

describe("Pattern/QC client sample garment how-to", () => {
  it("tells QC and Pattern to record a dropped-off garment with photos, in English and Bangla", () => {
    assert.equal(CLIENT_SAMPLE_GARMENT_HOWTO_NOTICE_ID, "howto-client-sample-garment-v3");
    assert.match(CLIENT_SAMPLE_GARMENT_HOWTO_TITLE, /Client sample/);
    assert.match(CLIENT_SAMPLE_GARMENT_HOWTO_BODY, /now called Client sample/);
    assert.match(CLIENT_SAMPLE_GARMENT_HOWTO_BODY, /Do not look for Client ready-made samples/);
    assert.match(CLIENT_SAMPLE_GARMENT_HOWTO_BODY, /Add garment/);
    assert.match(CLIENT_SAMPLE_GARMENT_HOWTO_BODY, /Add photos/);
    assert.match(CLIENT_SAMPLE_GARMENT_HOWTO_BODY, /Copy or Fix/);
    assert.match(CLIENT_SAMPLE_GARMENT_HOWTO_BODY, /photos confirm we received/i);
    assert.match(CLIENT_SAMPLE_GARMENT_HOWTO_BODY, /We gave it back to the client/);
    assert.match(CLIENT_SAMPLE_GARMENT_HOWTO_BODY, /BANGLA/);
    const howto = PATTERN_HOWTO_NOTICES.find(
      (row) => row.id === CLIENT_SAMPLE_GARMENT_HOWTO_NOTICE_ID
    );
    assert.equal(howto?.audience, "all_teams");
  });
});

describe("Pattern/QC Boggi brand folder how-to", () => {
  it("tells Pattern Boggi is a brand folder with one Overcoat sheet, in English and Bangla", () => {
    assert.equal(BOGGI_BRAND_FOLDER_HOWTO_NOTICE_ID, "howto-boggi-brand-folder-v1");
    assert.match(BOGGI_BRAND_FOLDER_HOWTO_TITLE, /Boggi is a brand folder/i);
    assert.match(BOGGI_BRAND_FOLDER_HOWTO_BODY, /Boggi folder/);
    assert.match(BOGGI_BRAND_FOLDER_HOWTO_BODY, /44 to 68/);
    assert.match(BOGGI_BRAND_FOLDER_HOWTO_BODY, /BANGLA/);
  });
});

describe("Pattern/QC correct scan start time how-to", () => {
  it("tells QC to correct the scan time after a late QR, in English and Bangla", () => {
    assert.equal(CORRECT_START_TIME_HOWTO_NOTICE_ID, "howto-correct-scan-start-time-v2");
    assert.match(CORRECT_START_TIME_HOWTO_TITLE, /Stitch kiosk Live|not Production/i);
    assert.match(CORRECT_START_TIME_HOWTO_BODY, /Correct start time/);
    assert.match(CORRECT_START_TIME_HOWTO_BODY, /Do not wait for admin/);
    assert.match(CORRECT_START_TIME_HOWTO_BODY, /BANGLA/);
    assert.match(CORRECT_START_TIME_HOWTO_BODY, /Stitch kiosk/);
  });
});

describe("Pattern ready-made size-run how-to", () => {
  it("tells QC and Pattern size runs are Ready-Made, in English and Bangla", () => {
    assert.equal(READY_MADE_SIZE_RUN_HOWTO_NOTICE_ID, "howto-ready-made-size-run-v1");
    assert.match(READY_MADE_SIZE_RUN_HOWTO_TITLE, /Ready-Made/i);
    assert.match(READY_MADE_SIZE_RUN_HOWTO_BODY, /Mark as ready-made/);
    assert.match(READY_MADE_SIZE_RUN_HOWTO_BODY, /SO-2026-0150/);
    assert.match(READY_MADE_SIZE_RUN_HOWTO_BODY, /BANGLA/);
    assert.match(READY_MADE_SIZE_RUN_HOWTO_BODY, /Ready-Made article/);
  });
});

describe("Pattern search across brands", () => {
  it("tells Pattern to type the client name even if a brand chip is on", () => {
    assert.equal(
      SEARCH_ACROSS_BRANDS_HOWTO_NOTICE_ID,
      "howto-search-across-brands-v1"
    );
    assert.match(SEARCH_ACROSS_BRANDS_HOWTO_TITLE, /every brand/);
    assert.match(SEARCH_ACROSS_BRANDS_HOWTO_BODY, /ibi/);
    assert.match(SEARCH_ACROSS_BRANDS_HOWTO_BODY, /Ibrahim/);
    assert.match(SEARCH_ACROSS_BRANDS_HOWTO_BODY, /Gilani/);
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
