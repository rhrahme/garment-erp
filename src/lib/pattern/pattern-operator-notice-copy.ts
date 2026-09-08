export type PatternHowToAudience = "pattern" | "all_teams";

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

export const CORRECT_START_TIME_HOWTO_V1_NOTICE_ID = "howto-correct-scan-start-time-v1";

export const CORRECT_START_TIME_HOWTO_NOTICE_ID = "howto-correct-scan-start-time-v2";

export const CORRECT_START_TIME_HOWTO_TITLE =
  "Correct start time is on Stitch kiosk Live - not Production";

export const CORRECT_START_TIME_HOWTO_BODY = [
  "ENGLISH",
  "If the garment QR was not ready, the stitcher still started sewing.",
  "When the QR is printed: stitcher scans badge, then scans the garment.",
  "That scan stores NOW as the start time.",
  "",
  "QC next - do not look on Production:",
  "1. Open Stitch kiosk (left menu). Not Factory floor / Production.",
  "2. Open Live (or History if they already closed).",
  "3. Press Correct start time on that Live row.",
  "4. Enter the real start time (Riyadh) and save.",
  "",
  "The clock changes immediately. Admin gets a request. Confirm or Reject does not stop the stitcher.",
  "Do not wait for admin. Do not use Request -> Edit and wait.",
  "",
  "BANGLA",
  "QR ready na thakle stitcher already kaj shuru koreche.",
  "QR print howar por: badge scan, then garment scan. Eita ekhonkar time save kore.",
  "",
  "QC porer kaj - Production e khujben na:",
  "1. Left menu te Stitch kiosk khulen. Factory floor / Production na.",
  "2. Live (ba History) khulen.",
  "3. Sei row te Correct start time chapun.",
  "4. Asol start time (Riyadh) din, save korun.",
  "",
  "Time sathe sathe change hobe. Admin request pabe. Confirm ba Reject kaj bandh korbe na.",
  "Admin er jonno wait korben na.",
].join("\n");

export const COPY_BASE_TO_BRAND_HOWTO_NOTICE_ID = "howto-copy-base-to-brand-v1";

export const COPY_BASE_TO_BRAND_HOWTO_TITLE =
  "How to copy a pattern to another brand and edit the numbers";

export const COPY_BASE_TO_BRAND_HOWTO_BODY = [
  "ENGLISH",
  "To put the same house pattern on another brand (FR to GL, or GL to FR):",
  "1. Open Pattern -> Library -> Bases.",
  "2. Open the pattern (example: Boggi Jacket on FR).",
  "3. At the top, pick the other brand.",
  "4. Press Copy to brand.",
  "5. The copy opens. Change the numbers, add or remove sizes, then press Save changes.",
  "",
  "If that brand already has the same cut, ERP opens the existing sheet. Edit that one. Do not make a second sheet.",
  "",
  "For a real client (not a brand folder):",
  "1. Open the client's pattern sheet.",
  "2. Press Load from base pattern.",
  "3. Pick the house base (example: Boggi Overcoat).",
  "4. Change his sizes, then press Save sheet.",
  "",
  "Do not create a new person client named after a brand.",
  "",
  "BANGLA",
  "Onno brand e same house pattern copy korte (FR theke GL, ba GL theke FR):",
  "1. Pattern -> Library -> Bases khulen.",
  "2. Pattern khulen (example: FR e Boggi Jacket).",
  "3. Upore onno brand select korun.",
  "4. Copy to brand chapun.",
  "5. Copy khulbe. Number change korun, size add/remove, then Save changes.",
  "",
  "Sei brand e same cut already thakle existing sheet khulbe. Oita edit korun. Notun second sheet banaben na.",
  "",
  "Asol client er jonno (brand folder na):",
  "1. Client er pattern sheet khulen.",
  "2. Load from base pattern chapun.",
  "3. House base pick korun (example: Boggi Overcoat).",
  "4. Tar size change, then Save sheet.",
  "",
  "Brand name e notun person client khulben na.",
].join("\n");

export const CLIENT_SAMPLE_GARMENT_HOWTO_V1_NOTICE_ID = "howto-client-sample-garment-v1";

export const CLIENT_SAMPLE_GARMENT_HOWTO_V2_NOTICE_ID = "howto-client-sample-garment-v2";

export const CLIENT_SAMPLE_GARMENT_HOWTO_NOTICE_ID = "howto-client-sample-garment-v3";

export const CLIENT_SAMPLE_GARMENT_HOWTO_TITLE =
  "Look for Client sample - upload the client's garment photos there";

export const CLIENT_SAMPLE_GARMENT_HOWTO_BODY = [
  "ENGLISH",
  "The place is now called Client sample. Do not look for Client ready-made samples or Client garments.",
  "",
  "When a client leaves a ready garment for us to copy or fix:",
  "1. Open Clients (left menu).",
  "2. Tap Client sample at the top to see garments still in the factory, or open the client.",
  "3. Scroll to Client sample.",
  "4. Press Add garment.",
  "5. Pick the garment type (Trouser, Jacket, Suit, Overcoat...).",
  "6. Tap Copy or Fix.",
  "7. Press Add photos and pick pictures of the garment - photos confirm we received it.",
  "8. Scan your employee ID badge and save.",
  "9. When you hand it back, press We gave it back to the client.",
  "",
  "Do not leave a client garment in the factory without photos.",
  "",
  "BANGLA",
  "Name ekhon Client sample. Client ready-made samples ba Client garments khujben na.",
  "",
  "Client garment copy ba fix er jonno rekhe gele:",
  "1. Left menu te Clients khulen.",
  "2. Upore Client sample tap korun, ba client khulen.",
  "3. Client sample e scroll korun.",
  "4. Add garment chapun.",
  "5. Garment type select korun (Trouser, Jacket, Suit, Overcoat...).",
  "6. Copy ba Fix tap korun.",
  "7. Add photos chapun - photo mane amra garment peyechi.",
  "8. Badge scan, then save.",
  "9. Client ke fire dile: We gave it back to the client chapun.",
].join("\n");

export const BOGGI_BRAND_FOLDER_HOWTO_NOTICE_ID = "howto-boggi-brand-folder-v1";

export const BOGGI_BRAND_FOLDER_HOWTO_TITLE =
  "Boggi is a brand folder - put Overcoat sizes on one sheet";

export const BOGGI_BRAND_FOLDER_HOWTO_BODY = [
  "ENGLISH",
  "Boggi is a brand, not a person client.",
  "In Pattern Library -> Bases, open the Boggi folder (BO).",
  "Inside it, Overcoat is one house base with all sizes (44 to 68).",
  "The file is named Boggi Measurement Spec for Overcoat.xlsx.",
  "Do not open a new client named Boggi Overcoat. Do not make one sheet per size.",
  "",
  "Later, when a real client wants this ready-made cut: Load from the Boggi Overcoat base, then change his sizes.",
  "The folder is on both Fouad Rahme and Gliani. Jacket and Trouser were already in Boggi.",
  "Ready-Made / Boggi still holds the production orders (SO-2026-0142 and SO-2026-0150).",
  "",
  "BANGLA",
  "Boggi ekta brand folder. Person client na.",
  "Pattern Library -> Bases -> Boggi (BO) khulen.",
  "Vitor e Overcoat ekta house base, shob size (44 theke 68).",
  "File name: Boggi Measurement Spec for Overcoat.xlsx.",
  "Boggi Overcoat name e notun client khulben na. Prottek size er jonno alada sheet banaben na.",
  "Pore asol client hole: Boggi Overcoat base theke load, then tar size change.",
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

export const SENT_STITCHED_GARMENT_HOWTO_V1_NOTICE_ID = "howto-sent-stitched-garment-v1";

export const SENT_STITCHED_GARMENT_HOWTO_NOTICE_ID = "howto-sent-stitched-garment-v2";

export const SENT_STITCHED_GARMENT_HOWTO_TITLE =
  "Sent: dropdown - handed to factory driver or client driver (proof photo)";

export const SENT_STITCHED_GARMENT_HOWTO_BODY = [
  "ENGLISH",
  "When we send a client the garment we stitched, use the delivery dropdown and say who took it. You can also upload a proof photo.",
  "",
  "Finished sales-order piece:",
  "1. Open Production (Factory floor).",
  "2. Find the packed piece (Ready to send).",
  "3. Open the dropdown: Handed to factory driver, or Handed to client driver.",
  "4. Optional: add a proof photo.",
  "5. Press Sent.",
  "",
  "Factory driver: he will later have an account and send a photo when he delivers to the client. You can still add a photo now.",
  "Client driver: we handed it to the client's driver at the factory. Add a proof photo if you have one.",
  "",
  "Client drop-off garment (copy or fix):",
  "1. Open Clients -> Samples, or open the client.",
  "2. Same dropdown. You can also pick Gave it back in person if they collected it themselves.",
  "3. Optional proof photo, then Sent.",
  "",
  "BANGLA",
  "Stitched garment client ke pathaile delivery dropdown theke ke nilo select korun. Proof photo upload kora jabe.",
  "Production -> packed piece -> Handed to factory driver ba Handed to client driver -> Sent.",
  "Factory driver pore account pabe, client er kache deliver korle photo pathabe.",
  "Client drop-off: Clients -> Samples -> same dropdown. Client nije nile Gave it back in person.",
].join("\n");

export const HERE_WALL_ATTENDANCE_HOWTO_NOTICE_ID = "howto-here-wall-attendance-v1";

export const HERE_WALL_ATTENDANCE_HOWTO_TITLE =
  "Morning attendance: scan the HERE poster, then your badge";

export const HERE_WALL_ATTENDANCE_HOWTO_BODY = [
  "ENGLISH",
  "In the morning, clock in on the stitch kiosk before you start a piece.",
  "",
  "1. Scan the HERE poster on the wall (same QR on every poster).",
  "2. Scan your ID badge.",
  "3. The kiosk says you are here.",
  "4. When you start a garment, scan the A4 piece QR as usual.",
  "",
  "Either order works: badge then HERE poster, or HERE poster then badge.",
  "This does not start or finish a piece. Leftover open work stays open.",
  "",
  "BANGLA",
  "Shokale stitch kiosk e age HERE poster scan, tarpor nijer badge.",
  "Kiosk bole you are here. Piece start korte pore A4 scan korun.",
  "Eta piece start ba finish kore na.",
].join("\n");

export const WALL_ATTENDANCE_QR_HOWTO_NOTICE_ID = "howto-wall-attendance-qr-v1";

export const WALL_ATTENDANCE_QR_HOWTO_TITLE =
  "Morning attendance: badge, then the wall QR (starts 8 Sep)";

export const WALL_ATTENDANCE_QR_HOWTO_BODY = [
  "ENGLISH",
  "Today: print the Attendance wall QR and hang it at the stitch kiosk.",
  "You may scan today to test. That does not count as present.",
  "Admin / Production / QC: Floor now or Stitch Performance -> Print attendance QR.",
  "",
  "From tomorrow (8 Sep 2026, Riyadh) the time you scan is the official clock-in:",
  "1. Scan your personal ID badge.",
  "2. Scan the wall Attendance QR.",
  "That marks you present. Then scan the garment A4 to start work.",
  "",
  "Do not double-scan a garment A4 for attendance. That starts or stops a piece.",
  "The wall QR never opens or closes garment work.",
  "Tablet camera: Stitch kiosk -> Use tablet camera. Gun scanner still works.",
  "",
  "BANGLA",
  "Ajke: Attendance wall QR print kore stitch kiosk e hang korun.",
  "Ajke test scan kora jabe. Eita present count hobe na.",
  "Admin / Production / QC: Floor now ba Stitch Performance -> Print attendance QR.",
  "",
  "Kal theke (8 Sep 2026, Riyadh) je time e scan, setai official clock-in:",
  "1. Nijer ID badge scan korun.",
  "2. Wall Attendance QR scan korun.",
  "Eita present mark kore. Tarpor garment A4 scan kore kaj shuru.",
  "",
  "Attendance er jonno garment A4 duibar scan korben na. Oita piece start/stop.",
  "Wall QR kono garment kaj khulbe ba bondho korbe na.",
  "Tablet camera: Stitch kiosk -> Use tablet camera. Gun scanner o kaj kore.",
].join("\n");

export const WALL_ATTENDANCE_QR_HOWTO_V2_NOTICE_ID = "howto-wall-attendance-qr-v2";

export const WALL_ATTENDANCE_QR_HOWTO_V2_TITLE =
  "Attendance at the entrance is separate from stitching";

export const WALL_ATTENDANCE_QR_HOWTO_V2_BODY = [
  "ENGLISH",
  "Attendance is at the entrance. It does not start a piece.",
  "",
  "1. Scan your personal ID badge.",
  "2. Scan the wall Attendance QR.",
  "That marks you present. You can do other work first.",
  "",
  "When you start stitching (later):",
  "1. Scan your ID badge again.",
  "2. Scan the garment A4.",
  "",
  "Do not double-scan a garment A4 for attendance. That starts or stops a piece.",
  "The wall QR never opens or closes garment work.",
  "Print: Floor now or Stitch Performance -> Print attendance QR.",
  "Tablet camera: Stitch kiosk -> Use tablet camera. Gun scanner still works.",
  "",
  "BANGLA",
  "Attendance entrance e. Eita piece start kore na.",
  "1. Nijer ID badge scan korun.",
  "2. Wall Attendance QR scan korun.",
  "Eita present mark. Age onno kaj kora jabe.",
  "",
  "Stitching shuru korte (pore):",
  "1. Abar ID badge scan korun.",
  "2. Garment A4 scan korun.",
  "",
  "Attendance er jonno garment A4 duibar scan korben na.",
  "Tablet camera: Stitch kiosk -> Use tablet camera. Gun scanner o kaj kore.",
].join("\n");

export const PRINT_SEWING_A4_FROM_PATTERN_HOWTO_NOTICE_ID =
  "howto-print-sewing-a4-from-pattern-v1";

export const PRINT_SEWING_A4_FROM_PATTERN_HOWTO_TITLE =
  "From Pattern: print Sewing A4s for the stitcher (size 52 example)";

export const PRINT_SEWING_A4_FROM_PATTERN_HOWTO_BODY = [
  "ENGLISH",
  "Goal: give the stitcher the Sewing / Production A4 for that piece (example: size 52).",
  "That paper has the floor QR (FR-...-L07-JKT-1/2). Do not give them the pattern library QR.",
  "",
  "1. Pattern -> open the sales order (Pattern order board).",
  "2. Tick only the fabric rows still on the order (skip Removed leftover jobs).",
  "3. If there is no sheet yet: Consolidate selected -> New pattern -> Create pattern -> upload .TUD.",
  "   Fill Sample / Trial / Final, including size 52.",
  "4. If the sheet already exists: Open job (or Master pattern for that fabric).",
  "5. Check size 52 is filled on the sheet.",
  "6. Print for stitching (pick one):",
  "   - On the job or client sheet: Sewing A4s (or Print production).",
  "   - Tick the size 52 fabric (or Select all), then open the preview.",
  "   - Or on the order board: tick fabrics, choose Sewing or Production, Print selected.",
  "7. You get one A4 per stitcher piece. Overshirt+Trouser / Suit = two pages",
  "   (Overshirt or Jacket, then Trouser), each with its own floor QR.",
  "8. Print: A4 portrait, Actual size / 100%.",
  "9. Give that A4 to the stitcher with the garment. They scan badge, then THIS QR.",
  "",
  "Do not print Cutter for the stitcher (cutter is one page for cutting).",
  "Do not scan or hand over the pattern paper QR (/pattern/library/bases/...).",
  "Production can also print from the sales order -> Print production.",
  "",
  "BANGLA",
  "Goal: stitcher ke Sewing A4 dao (example size 52). Oita te floor QR thake (FR-...-JKT-1/2).",
  "Pattern library QR diben na.",
  "",
  "1. Pattern -> sales order khulun.",
  "2. Je fabric ekhono order e ase, oita tick. Removed leftover skip.",
  "3. Sheet na thakle: Consolidate selected -> New pattern -> .TUD upload. Size 52 fill.",
  "4. Sheet thakle: Open job.",
  "5. Size 52 check.",
  "6. Sewing A4s ba Print production. Size 52 fabric tick. Preview open.",
  "   Order board: tick -> Sewing/Production -> Print selected.",
  "7. Piece moto alada A4. Combo hole Overshirt/Jacket page + Trouser page.",
  "8. Print A4 portrait, Actual size.",
  "9. Paper garment er sathe stitcher ke dao. Badge, then ei A4 QR.",
  "",
  "Cutter stitcher ke diben na. Pattern paper QR stitch e kaj korbe na.",
].join("\n");

export const STITCH_PIECE_A4_HOWTO_NOTICE_ID = "howto-stitch-piece-a4-not-pattern-v1";

export const STITCH_PIECE_A4_HOWTO_TITLE =
  "Stitch a piece (size 52): badge, then the A4 on the garment";

export const STITCH_PIECE_A4_HOWTO_BODY = [
  "ENGLISH",
  "Example: Soldier is stitching a size 52. Same steps for every size.",
  "",
  "Morning attendance (does not start the 52):",
  "1. Scan your ID badge and the wall Attendance QR, either order.",
  "2. You are marked present. Do other prep if needed.",
  "",
  "Start the size 52:",
  "1. Take the size 52 garment that already has the A4 sticker on it.",
  "2. At the stitch kiosk, scan your ID badge.",
  "3. Within 30 seconds, scan the A4 QR on that same garment.",
  "   The code looks like FR-0132-L07-JKT-1/2 (client + line + jacket/trouser).",
  "4. The kiosk says you are working. Sew the 52.",
  "",
  "Do not scan the pattern paper QR (the one that opens /pattern/library/...).",
  "That is for the Pattern desk. Stitch will say Code not recognized.",
  "",
  "Finish the size 52:",
  "1. Scan your badge, then the same A4 on the garment.",
  "   Or scan that A4, then your badge.",
  "2. The kiosk closes the piece.",
  "",
  "Already have a piece open: badge then that open A4 finishes it.",
  "Badge then a new A4 opens the next one.",
  "",
  "BANGLA",
  "Example: size 52 stitch. Same process every size.",
  "Attendance: badge + wall QR (je kono order). Eita 52 start kore na.",
  "",
  "Start:",
  "1. Je 52 garment e A4 sticker ase, oita nao.",
  "2. Kiosk e nijer badge scan.",
  "3. 30 second er vitore oi garment er A4 scan (FR-...-L07-JKT-1/2).",
  "4. Kiosk bole working. Tarpor sew.",
  "",
  "Pattern paper QR scan korben na. Oita Pattern desk er. Code not recognized asbe.",
  "",
  "Finish: badge then same A4, ba A4 then badge.",
  "Open piece finish: badge then oi A4. Next piece: badge then notun A4.",
].join("\n");

export const STITCH_KIOSK_PROCESS_TITLE = "How to stitch a piece (size 52 or any size)";

export const STITCH_KIOSK_PROCESS_STEPS = [
  "1. Badge.",
  "2. A4 sticker ON THE GARMENT (FR-...-L07-JKT-1/2) within 30 seconds.",
  "3. Sew.",
  "4. Finish: badge then the same A4. Or A4 then badge.",
  "Do not scan the pattern paper QR. That is not the garment.",
];

export const WALL_ATTENDANCE_QR_HOWTO_V3_NOTICE_ID = "howto-wall-attendance-qr-v3";

export const WALL_ATTENDANCE_QR_HOWTO_V3_TITLE =
  "Attendance: badge and wall QR, either order";

export const WALL_ATTENDANCE_QR_HOWTO_V3_BODY = [
  "ENGLISH",
  "Attendance is at the entrance. It does not start a piece.",
  "",
  "Either order is accepted and registered:",
  "- Scan your ID badge, then the wall Attendance QR.",
  "- Or scan the wall QR, then your ID badge.",
  "That marks you present. You can do other work first.",
  "",
  "When you start stitching (later):",
  "1. Scan your ID badge again.",
  "2. Scan the garment A4.",
  "",
  "Do not double-scan a garment A4 for attendance.",
  "Print: Floor now or Stitch Performance -> Print attendance QR.",
  "Tablet camera: Stitch kiosk -> Use tablet camera. Gun scanner still works.",
  "",
  "BANGLA",
  "Attendance entrance e. Eita piece start kore na.",
  "Dui order e register hoy: badge then wall QR, ba wall QR then badge.",
  "Eita present mark. Age onno kaj kora jabe.",
  "",
  "Stitching shuru korte (pore): abar badge, then garment A4.",
  "Attendance er jonno garment A4 duibar scan korben na.",
].join("\n");

export function howtoAudience(id: string): PatternHowToAudience {
  return PATTERN_HOWTO_NOTICES.find((row) => row.id === id)?.audience ?? "pattern";
}

export function isAllTeamsHowTo(id: string): boolean {
  return howtoAudience(id) === "all_teams";
}

export function isPatternAudienceHowTo(id: string): boolean {
  if (id === SENT_STITCHED_GARMENT_HOWTO_V1_NOTICE_ID) return false;
  if (id === CLIENT_SAMPLE_GARMENT_HOWTO_V1_NOTICE_ID) return false;
  if (id === CLIENT_SAMPLE_GARMENT_HOWTO_V2_NOTICE_ID) return false;
  if (id === CORRECT_START_TIME_HOWTO_V1_NOTICE_ID) return false;
  return howtoAudience(id) === "pattern";
}

/** Newest first. Pattern how-tos email Pattern. all_teams email every team, EN+BN. */
export const PATTERN_HOWTO_NOTICES: PatternHowToDefinition[] = [
  {
    id: PRINT_SEWING_A4_FROM_PATTERN_HOWTO_NOTICE_ID,
    title: PRINT_SEWING_A4_FROM_PATTERN_HOWTO_TITLE,
    body: PRINT_SEWING_A4_FROM_PATTERN_HOWTO_BODY,
    href: "/pattern",
    href_label: "Open Pattern home",
    audience: "pattern",
  },
  {
    id: STITCH_PIECE_A4_HOWTO_NOTICE_ID,
    title: STITCH_PIECE_A4_HOWTO_TITLE,
    body: STITCH_PIECE_A4_HOWTO_BODY,
    href: "/stitch",
    href_label: "Open stitch kiosk",
    audience: "all_teams",
  },
  {
    id: WALL_ATTENDANCE_QR_HOWTO_V3_NOTICE_ID,
    title: WALL_ATTENDANCE_QR_HOWTO_V3_TITLE,
    body: WALL_ATTENDANCE_QR_HOWTO_V3_BODY,
    href: "/stitch/attendance/print",
    href_label: "Print attendance QR",
    audience: "all_teams",
  },
  {
    id: COPY_BASE_TO_BRAND_HOWTO_NOTICE_ID,
    title: COPY_BASE_TO_BRAND_HOWTO_TITLE,
    body: COPY_BASE_TO_BRAND_HOWTO_BODY,
    href: "/pattern/library",
    href_label: "Open Pattern Library",
    audience: "pattern",
  },
  {
    id: CLIENT_SAMPLE_GARMENT_HOWTO_NOTICE_ID,
    title: CLIENT_SAMPLE_GARMENT_HOWTO_TITLE,
    body: CLIENT_SAMPLE_GARMENT_HOWTO_BODY,
    href: "/clients?view=samples",
    href_label: "Open Client sample",
    audience: "all_teams",
  },
  {
    id: CORRECT_START_TIME_HOWTO_NOTICE_ID,
    title: CORRECT_START_TIME_HOWTO_TITLE,
    body: CORRECT_START_TIME_HOWTO_BODY,
    href: "/stitch?tab=live",
    href_label: "Open Stitch Live",
    audience: "all_teams",
  },
  {
    id: SENT_STITCHED_GARMENT_HOWTO_NOTICE_ID,
    title: SENT_STITCHED_GARMENT_HOWTO_TITLE,
    body: SENT_STITCHED_GARMENT_HOWTO_BODY,
    href: "/production",
    href_label: "Open Factory floor",
    audience: "all_teams",
  },
  {
    id: BOGGI_BRAND_FOLDER_HOWTO_NOTICE_ID,
    title: BOGGI_BRAND_FOLDER_HOWTO_TITLE,
    body: BOGGI_BRAND_FOLDER_HOWTO_BODY,
    href: "/pattern/library",
    href_label: "Open Pattern Library",
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
