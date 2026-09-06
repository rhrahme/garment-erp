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

export const SEARCH_ACROSS_BRANDS_HOWTO_NOTICE_ID =
  "howto-search-across-brands-v1";

export const SEARCH_ACROSS_BRANDS_HOWTO_TITLE =
  "Type a client name - search looks in every brand";

export const SEARCH_ACROSS_BRANDS_HOWTO_BODY = [
  "Type the client name in the search box. You do not need to tap All brands first.",
  "",
  "1. Example: type ibi or ibra. Ibrahim appears even if Gilani was selected.",
  "2. Gilani only has Gilani clients. Ibrahim is Fouad Rahme.",
  "3. Both Pattern logins share the same full list. Search looks in every brand.",
].join("\n");

export const SAME_QUEUE_ALL_BRANDS_HOWTO_NOTICE_ID =
  "howto-same-queue-all-brands-v1";

export const SAME_QUEUE_ALL_BRANDS_HOWTO_TITLE =
  "Both Pattern logins see the same clients - tap All brands";

export const SAME_QUEUE_ALL_BRANDS_HOWTO_BODY = [
  "There is one Pattern queue and one client list. Pattern 2 and the other Pattern login see the same data.",
  "",
  "1. At the top of Queue or Clients, tap All brands.",
  "2. New (8) instead of New (51) means that screen is filtered to one house brand (Gilani, Fouad Rahme, ...).",
  "3. That is a filter on that computer, not a second account.",
].join("\n");

export const FABRIC_SPEC_BOTH_ACCOUNTS_HOWTO_NOTICE_ID =
  "howto-fabric-spec-both-accounts-v1";

export const FABRIC_SPEC_BOTH_ACCOUNTS_HOWTO_TITLE =
  "Fabric Specification is on the left menu (prices stay hidden)";

export const FABRIC_SPEC_BOTH_ACCOUNTS_HOWTO_BODY = [
  "Both Pattern logins see the same Fabric Specification page. Composition, GSM, width, HS, color, and swatches are there. List prices stay hidden.",
  "",
  "1. Left menu: Fabric Specification.",
  "2. Search the fabric number.",
  "3. Open Preview for the swatch and the spec lines.",
  "",
  "If you do not see prices, that is correct. Pattern does not see list prices.",
].join("\n");

export const OVERSHIRT_WAIST_NOT_TROUSER_HOWTO_NOTICE_ID =
  "howto-overshirt-waist-not-trouser-v1";

export const OVERSHIRT_WAIST_NOT_TROUSER_HOWTO_TITLE =
  "Overshirt 1/2 Waist is not Trouser waist";

export const OVERSHIRT_WAIST_NOT_TROUSER_HOWTO_BODY = [
  "1/2 Waist on Overshirt stays on Overshirt. It does not go to Trouser.",
  "",
  "1. Piece Overshirt: type 1/2 Waist there (example 60.5).",
  "2. Piece Trouser: Trouser waist is Waist Relax. You will not see the Overshirt 1/2 Waist.",
  "3. If you delete it on Trouser and it comes back, that is fixed. One number is not shared.",
].join("\n");

export const PRINT_HOWTO_KEEP_PAPER_NOTICE_ID = "howto-print-howto-keep-paper-v1";

export const PRINT_HOWTO_KEEP_PAPER_TITLE =
  "Print How-to and keep the paper at the desk";

export const PRINT_HOWTO_KEEP_PAPER_BODY = [
  "Print the How-to steps and keep the paper next to you. No excuse that you got lost.",
  "",
  "1. Open Pattern -> How-to.",
  "2. Press Print all how-tos, or Print this on one card.",
  "3. Print A4 portrait, Actual size.",
  "4. Keep the paper at the Pattern desk.",
  "",
  "The same steps stay on the ERP How-to tab. Paper is so you can follow them without waiting for the owner.",
].join("\n");

export const PATTERN_FILES_BY_BRAND_HOWTO_NOTICE_ID = "howto-pattern-files-by-brand-v1";

export const PATTERN_FILES_BY_BRAND_HOWTO_TITLE =
  "Pattern -> Files: see who is missing TUD, DXF, or RUL";

export const PATTERN_FILES_BY_BRAND_HOWTO_BODY = [
  "Open Pattern -> Files. Clients are grouped by brand.",
  "",
  "Yes = uploaded. No = still missing.",
  "TUD is required. DXF and RUL are the other files.",
  "",
  "Missing TUD filter = no measurement file yet.",
  "Missing DXF / RUL filter = TUD is there, other files are not.",
  "",
  "Press Open to upload on that pattern. Press Open order if there is no pattern sheet yet.",
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

export const CORRECT_START_TIME_HOWTO_NOTICE_ID = "howto-correct-scan-start-time-v1";

export const CORRECT_START_TIME_HOWTO_TITLE =
  "QR late: scan now, then QC corrects the start time";

export const CORRECT_START_TIME_HOWTO_BODY = [
  "ENGLISH",
  "If the garment QR was not ready, the stitcher still started sewing.",
  "When the QR is printed: stitcher scans badge, then scans the garment.",
  "That scan stores NOW as the start time.",
  "",
  "QC next:",
  "1. Open Stitch kiosk (left menu).",
  "2. Open Live (or History if they already closed).",
  "3. Press Correct start time.",
  "4. Enter the real start time (Riyadh) and save.",
  "",
  "The clock changes immediately. Admin gets a request. Confirm or Reject does not stop the stitcher.",
  "Do not wait for admin. Do not use Request -> Edit and wait.",
  "",
  "BANGLA",
  "QR ready na thakle stitcher already kaj shuru koreche.",
  "QR print howar por: badge scan, then garment scan. Eita ekhonkar time save kore.",
  "",
  "QC porer kaj:",
  "1. Left menu te Stitch kiosk khulen.",
  "2. Live (ba History) khulen.",
  "3. Correct start time chapun.",
  "4. Asol start time (Riyadh) din, save korun.",
  "",
  "Time sathe sathe change hobe. Admin request pabe. Confirm ba Reject kaj bandh korbe na.",
  "Admin er jonno wait korben na.",
].join("\n");

export const READY_MADE_SIZE_RUN_HOWTO_NOTICE_ID = "howto-ready-made-size-run-v1";

export const READY_MADE_SIZE_RUN_HOWTO_TITLE =
  "Boggi / Massimo size runs are Ready-Made - not a new client";

export const READY_MADE_SIZE_RUN_HOWTO_BODY = [
  "ENGLISH",
  "Boggi, Massimo Dutti, Suit Supply, Cafe Cotton, Zegna size runs are Ready-Made.",
  "They are not a person client.",
  "",
  "Wrong: create a new client named Boggi Overcoat, then add Stock-44, Stock-46, Stock-48...",
  "Right: those numbers are sizes of one Ready-Made article.",
  "",
  "Next time (QC):",
  "1. Do not add a new person client for a retail brand.",
  "2. Open the sales order.",
  "3. Press Mark as ready-made and pick Boggi (or the brand).",
  "4. Open Ready-Made in the left menu to follow the article.",
  "",
  "Next time (Pattern):",
  "1. Do not draft a new pattern sheet for each size.",
  "2. If you see Boggi Overcoat / Massimo as a person with Stock-44 lines, tell QC to mark it Ready-Made.",
  "3. We already moved SO-2026-0142 and SO-2026-0150 to Ready-Made / Boggi. Those pattern jobs are cancelled.",
  "",
  "BANGLA",
  "Boggi / Massimo / Suit Supply size wala kaj Ready-Made. Eita notun person client na.",
  "",
  "Vul: Boggi Overcoat name e notun client khola, then Stock-44, 46, 48 alada line.",
  "Sothik: shob size ekta Ready-Made article.",
  "",
  "QC porer bar:",
  "1. Retail brand er jonno notun person client banaben na.",
  "2. Sales order khulen.",
  "3. Mark as ready-made chapun, brand select korun (Boggi).",
  "4. Left menu te Ready-Made theke follow korun.",
  "",
  "Pattern porer bar:",
  "1. Prottek size er jonno notun pattern sheet banaben na.",
  "2. Jodi person client hishebe Boggi Overcoat dekhun, QC ke Ready-Made mark korte bolun.",
  "3. SO-2026-0142 ar SO-2026-0150 Ready-Made / Boggi te move hoise. Sei pattern job cancel.",
].join("\n");

/** Newest first. Each entry is emailed to Pattern and kept on the How-to tab. */
export const PATTERN_HOWTO_NOTICES: PatternHowToDefinition[] = [
  {
    id: CORRECT_START_TIME_HOWTO_NOTICE_ID,
    title: CORRECT_START_TIME_HOWTO_TITLE,
    body: CORRECT_START_TIME_HOWTO_BODY,
    href: "/stitch?tab=live",
    href_label: "Open Stitch Live",
    audience: "pattern",
  },
  {
    id: READY_MADE_SIZE_RUN_HOWTO_NOTICE_ID,
    title: READY_MADE_SIZE_RUN_HOWTO_TITLE,
    body: READY_MADE_SIZE_RUN_HOWTO_BODY,
    href: "/ready-made",
    href_label: "Open Ready-Made",
    audience: "pattern",
  },
  {
    id: SEARCH_ACROSS_BRANDS_HOWTO_NOTICE_ID,
    title: SEARCH_ACROSS_BRANDS_HOWTO_TITLE,
    body: SEARCH_ACROSS_BRANDS_HOWTO_BODY,
    href: "/pattern",
    href_label: "Open Pattern queue",
    audience: "pattern",
  },
  {
    id: SAME_QUEUE_ALL_BRANDS_HOWTO_NOTICE_ID,
    title: SAME_QUEUE_ALL_BRANDS_HOWTO_TITLE,
    body: SAME_QUEUE_ALL_BRANDS_HOWTO_BODY,
    href: "/pattern",
    href_label: "Open Pattern queue",
    audience: "pattern",
  },
  {
    id: FABRIC_SPEC_BOTH_ACCOUNTS_HOWTO_NOTICE_ID,
    title: FABRIC_SPEC_BOTH_ACCOUNTS_HOWTO_TITLE,
    body: FABRIC_SPEC_BOTH_ACCOUNTS_HOWTO_BODY,
    href: "/fabric-specification",
    href_label: "Open Fabric Specification",
    audience: "pattern",
  },
  {
    id: OVERSHIRT_WAIST_NOT_TROUSER_HOWTO_NOTICE_ID,
    title: OVERSHIRT_WAIST_NOT_TROUSER_HOWTO_TITLE,
    body: OVERSHIRT_WAIST_NOT_TROUSER_HOWTO_BODY,
    href: "/pattern",
    href_label: "Open Pattern home",
    audience: "pattern",
  },
  {
    id: PRINT_HOWTO_KEEP_PAPER_NOTICE_ID,
    title: PRINT_HOWTO_KEEP_PAPER_TITLE,
    body: PRINT_HOWTO_KEEP_PAPER_BODY,
    href: "/pattern/how-to/print",
    href_label: "Print all how-tos",
    audience: "pattern",
  },
  {
    id: PATTERN_FILES_BY_BRAND_HOWTO_NOTICE_ID,
    title: PATTERN_FILES_BY_BRAND_HOWTO_TITLE,
    body: PATTERN_FILES_BY_BRAND_HOWTO_BODY,
    href: "/pattern/missing-files",
    href_label: "Open Files",
    audience: "pattern",
  },
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
