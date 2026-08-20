export type PatternHowToAudience = "pattern";

export interface PatternHowToDefinition {
  id: string;
  title: string;
  body: string;
  href: string;
  href_label: string;
  audience: PatternHowToAudience;
}

export const CONSOLIDATE_FABRICS_HOWTO_NOTICE_ID = "howto-consolidate-fabrics-v1";

export const CONSOLIDATE_FABRICS_HOWTO_TITLE =
  "How to merge / consolidate fabrics, then add the pattern";

export const CONSOLIDATE_FABRICS_HOWTO_BODY = [
  "Use this when several fabric lines on one order share the same pattern (.TUD / measurement sheet).",
  "",
  "Steps:",
  "1. Open Pattern home (/pattern).",
  "2. Open the sales order (Pattern order board).",
  "3. Tick every fabric that should share ONE pattern.",
  "4. Click Consolidate selected.",
  "5. Choose one:",
  "   - New pattern -> Create pattern -> upload .TUD",
  "   - Existing pattern -> Link & open pattern",
  "6. On the pattern page: upload the .TUD and fill Sample / Trial / Final sizes.",
  "",
  "Shortcut: on Pattern home or the order board, you can also use",
  "Auto-consolidate by composition/weight - it groups matching fabrics for you,",
  "then open each linked pattern to upload .TUD and fill sizes.",
  "",
  "Tip: fabrics that already show Not linked - select & consolidate still need this step.",
].join("\n");

export const REMOVE_FABRIC_FROM_CONSOLIDATION_HOWTO_NOTICE_ID =
  "howto-remove-fabric-from-consolidation-v1";

export const REMOVE_FABRIC_FROM_CONSOLIDATION_HOWTO_TITLE =
  "How to remove one fabric from a consolidated / grouped pattern";

export const REMOVE_FABRIC_FROM_CONSOLIDATION_HOWTO_BODY = [
  "Use this when fabrics are already grouped on one measurement sheet and one fabric should be treated separately.",
  "",
  "Steps:",
  "1. Open the grouped measurement sheet (the consolidated pattern).",
  "2. Find the Grouped fabrics box.",
  "3. Press Remove on the fabric row that should leave the group.",
  "4. Confirm.",
  "",
  "The fabric stays on the sales order. It only leaves this group so you can treat it on its own.",
  "The other fabrics stay together.",
  "",
  "Other path: Client fabric board -> open that fabric -> Remove from this pattern.",
  "",
  "After it leaves the group you can keep it on its own sheet, or consolidate it into a different group later.",
].join("\n");

export const CONSOLIDATE_REMOVED_SO_LINES_HOWTO_NOTICE_ID =
  "howto-consolidate-removed-so-lines-v1";

export const CONSOLIDATE_REMOVED_SO_LINES_HOWTO_TITLE =
  "If consolidate says fabrics not found on the sales order";

export const CONSOLIDATE_REMOVED_SO_LINES_HOWTO_BODY = [
  "That error means some ticked rows are leftover pattern jobs. QC already removed or transferred those fabrics from the sales order, so Pattern cannot attach a sheet to them.",
  "",
  "What to do:",
  "1. Stay on the Pattern order board (the SO list of fabrics).",
  "2. Rows marked Removed from this sales order cannot be ticked. Leave them.",
  "3. Tick only the Overshirt+Trouser (or other garment) rows that are still on the order.",
  "4. Click Consolidate selected -> New pattern -> Create pattern -> upload .TUD.",
  "",
  "Select all now skips the leftover rows automatically.",
  "",
  "If you still need a removed fabric (example: Ibrahim SO-2026-0130 S21006 / S21007 / S21008 / S21009), ask QC to put it back on the sales order first. Pattern cannot consolidate a fabric that is no longer on the order.",
].join("\n");

export const ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_NOTICE_ID =
  "howto-add-fabrics-to-existing-consolidation-v2";

export const ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_TITLE =
  "More fabrics go on the same pattern. Not a new pattern.";

export const ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_BODY = [
  "This is extra fabrics for a pattern you already made. Not a new pattern.",
  "",
  "1. Open the same sales order.",
  "2. Tick only the extra fabrics. Leave the old grouped ones unchecked.",
  "3. Press Consolidate selected.",
  "4. Press Same pattern. Do not press New pattern.",
  "5. Pick the pattern you already made.",
  "6. Press Add to this pattern.",
  "",
  "Done. Same sheet, same sizes, same .TUD. Shirt extras on the Shirt sheet. Trouser extras on the Trouser sheet.",
].join("\n");

export const ERP_SOURCE_OF_TRUTH_LEFTOVER_JOBS_HOWTO_NOTICE_ID =
  "howto-erp-source-of-truth-leftover-jobs-v1";

export const ERP_SOURCE_OF_TRUTH_LEFTOVER_JOBS_HOWTO_TITLE =
  "Leftover pattern jobs are cleared - tick what is still on the order";

export const ERP_SOURCE_OF_TRUTH_LEFTOVER_JOBS_HOWTO_BODY = [
  "The ERP sales order is the source of truth. We are not using ClickUp anymore.",
  "",
  "If QC already removed a fabric from the sales order, that leftover pattern job is cancelled automatically. You will not keep seeing it on the order board.",
  "",
  "To consolidate Ibrahim Overshirt+Trouser (SO-2026-0130) or any remaining fabrics:",
  "1. Open the Pattern order board.",
  "2. Tick the Overshirt+Trouser (and other) rows that are still on the order.",
  "3. Click Consolidate selected -> New pattern -> Create pattern -> upload .TUD.",
  "",
  "Do not wait on leftover / removed rows. Tick only what is still on the sales order.",
].join("\n");

/** Newest first. Each entry is emailed to Pattern and kept on the How-to tab. */
export const PATTERN_HOWTO_NOTICES: PatternHowToDefinition[] = [
  {
    id: ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_NOTICE_ID,
    title: ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_TITLE,
    body: ADD_FABRICS_TO_EXISTING_CONSOLIDATION_HOWTO_BODY,
    href: "/pattern",
    href_label: "Open Pattern home",
    audience: "pattern",
  },
  {
    id: ERP_SOURCE_OF_TRUTH_LEFTOVER_JOBS_HOWTO_NOTICE_ID,
    title: ERP_SOURCE_OF_TRUTH_LEFTOVER_JOBS_HOWTO_TITLE,
    body: ERP_SOURCE_OF_TRUTH_LEFTOVER_JOBS_HOWTO_BODY,
    href: "/pattern",
    href_label: "Open Pattern home",
    audience: "pattern",
  },
  {
    id: CONSOLIDATE_REMOVED_SO_LINES_HOWTO_NOTICE_ID,
    title: CONSOLIDATE_REMOVED_SO_LINES_HOWTO_TITLE,
    body: CONSOLIDATE_REMOVED_SO_LINES_HOWTO_BODY,
    href: "/pattern",
    href_label: "Open Pattern home",
    audience: "pattern",
  },
  {
    id: REMOVE_FABRIC_FROM_CONSOLIDATION_HOWTO_NOTICE_ID,
    title: REMOVE_FABRIC_FROM_CONSOLIDATION_HOWTO_TITLE,
    body: REMOVE_FABRIC_FROM_CONSOLIDATION_HOWTO_BODY,
    href: "/pattern/how-to",
    href_label: "Open Pattern How-to",
    audience: "pattern",
  },
  {
    id: CONSOLIDATE_FABRICS_HOWTO_NOTICE_ID,
    title: CONSOLIDATE_FABRICS_HOWTO_TITLE,
    body: CONSOLIDATE_FABRICS_HOWTO_BODY,
    href: "/pattern",
    href_label: "Open Pattern home",
    audience: "pattern",
  },
];
