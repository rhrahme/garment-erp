# Garment ERP - Knowledge Base

Durable product decisions and invariants. Agents: read this before changing
behavior, and update it when a decision is made or reversed. Session details
live in the `session-*.md` notes; this file holds only what stays true.

Production: https://erp.hagan.pro (Vercel projects `garment-erp` + `garment-erp-kvsf`, both must be Ready)

## Stitch floor (kiosk)

- Scan flow: EMP badge -> A4 piece QR -> work -> same A4 -> badge. Kiosk login: `stitch@hagan.pro`.
- **Badge `job_functions` is the source of truth for activity labels** (Cutting /
  Sewing / Wash / Iron / Buttons) site-wide - Scan, Live, Performance, History,
  Orders. Never hardcode "Sewing".
- **ID badges carry two QRs**. Tailors (and most roles): `EMP:{id}` (normal
  sew) and `EMPALT:{id}` (alteration). Alteration QR arms the next piece as
  `work_kind=alteration`; Live/History/Orders highlight **Alteration** (amber)
  without replacing job_functions. **Any tailor may run alterations for now**
  - that is why EMPALT is a separate QR/mode, not a payroll `job_function`.
  Later, when headcount allows a dedicated alterations team, we may add
  Alteration as a job_function; until then do not require a special role and
  do not strip EMPALT.
- **Wash/iron + Buttons dual-role badges** (Aug 10 2026): when an employee has
  both `wash_iron` and `buttons` and no tailor role (e.g. Cherry), the card
  prints **IRONING** (`EMPIRON:{id}`) + **BUTTONS** (`EMPBTN:{id}`) instead of
  SEWING/ALTERATION. Scanning arms `activity_job_function` so Live shows
  Ironing or Buttons for that session (not always Wash / iron from role
  priority). Rohan (wash_iron only) keeps SEWING/ALTERATION. USB wedge
  reassembly must treat `EMPALT` / `EMPIRON` / `EMPBTN` (and `:` variants) as
  partial fragments (never collapse to `EMP:`). Starting an alteration session
  writes `pattern_alteration_pending` (idempotent per session) and notifies
  Pattern (`production.alteration_started` / `pattern.alteration_chart_pending`)
  for that article + same-fabric siblings on the SO (article # from sticker
  L## when present). Pending write/notify failures must not fail the stitch
  scan; `/pattern` heals missing rows from open alteration sessions. Pattern
  clears via Acknowledge / Chart updated. Pattern is not required before the
  tailor starts. Pattern enters stitcher comments on the client measurement
  sheet (per-line Remark + bottom Stitcher comments) and/or from the
  alteration queue; those print on the Production / stitcher A4. **Badge
  layout**: QRs are 20mm with full labels (**SEWING** / **ALTERATION**, or
  **IRONING** / **BUTTONS**), centered as a pair with a fixed **3cm** clear
  gap between code edges (not opposite card edges, not abbreviated). Reprint
  Expats badges after dual-QR / layout changes.
- **All employees on the Expats ID badge list may use the kiosk** - cutters,
  wash/iron, buttons, not only tailors. Do not re-add a tailor-only gate.
- **Multi-arm queue is intentional**: several employees may be badge-ready at
  once; the next A4 scan assigns to the most recent badge (`mostRecentArm`).
  This was removed once (`09033b3`) and restored (`c158f4b`) - do not remove again.
- **Cutter stacked / consolidated nest** (Aug 10 2026): when badge activity is
  **Cutting** (cutter job_functions, not tailor), the cutter may open **many**
  piece sessions before closing - pile fabrics, scan each Trouser (or piece)
  A4 to open, cut once, then rescan each A4 + badge to finish. Close is
  A4-first (never badge-first close while stacked). After each open the
  cutter stays armed for the next A4. Do not re-block cutters with
  `employee_has_open_piece` without an explicit ask.
- **Stitchers chain-stitch several articles at once** (Aug 11 2026): Sewing
  activity also stacks open pieces (e.g. a run of white shirts chained on
  the machine). Badge -> A4 -> A4 -> ... opens one Live session per article;
  after each open the stitcher stays armed for the next A4. Close is
  A4-first per piece (rescan that article's A4, then badge).
  `employeeAllowsStackedOpenPieces` = Cutting or Sewing; wash/iron and
  buttons stay one-open-at-a-time. Do not re-add the tailor one-open gate.
- **Multi-stitcher same article QR** (Aug 10 2026): garment work (especially
  jackets/overshirts) can be **divided across several stitchers** on the
  **same** A4/production QR at once. Each stitcher opens their own Live
  session (badge then A4). Do not treat an open session for stitcher A as a
  close for stitcher B when B is armed. Close is per stitcher (badge of the
  finisher when several are on that QR; A4 alone is ambiguous if multiple
  open). `resolveSharedPieceScan` owns this. Do not re-block shared QR opens.
- **Admin email on new stitch session** (Aug 10 2026): when a stitch kiosk
  opens a piece session (badge+A4 or A4+badge), email ADMIN_EMAILS +
  SUPER_ADMIN_EMAILS with employee, production code, fabric, SO, client,
  kiosk, work kind. Must not fail the scan if SMTP fails. Badge-only arms
  and rejected scans do not email.

- USB wedge capture must always steal rapid keystrokes (even over selection or
  focused fields) and show an optimistic "Last scan" strip on every tab.
  Silence on scan is a bug, never acceptable. **Admin copy** (Aug 19 2026):
  admin may select and copy ERP text. Scan capture must not reclaim focus or
  clear selection for admin (`admin-copy-unlock`). Other roles stay scan-first.
  Do not give stitch@ / pattern this copy unlock.
- **Admin pause stitch kiosk**: on `/production` Floor now, admin can Pause /
  Resume. Persisted in `stitch_kiosk_settings` (`erp_documents`). While paused,
  `processSewingKioskScan` blocks all badge/A4 work (UI + `/api/v1/.../scan`)
  with `reason_code=kiosk_paused` without writing `sewing_scan_failures`. Live
  / Scan elapsed clocks **freeze** for the pause window (`pause_intervals`) so
  lunch does not keep counting; after resume, paused time is excluded from
  elapsed. Do not remove this gate or hide the admin control.
- **Lunch auto-resume 16:00 Asia/Riyadh** (Aug 10 2026): pause/resume is the
  **floor scan gate only** (not per article). Pauses started in the lunch
  window (14:00-16:00 Riyadh) get `auto_resume_at` = that day's 16:00. Scan
  and Live polls call `ensureStitchKioskLunchAutoResume` so the gate reopens
  at/after 16:00 without restarting articles (route
  `/api/cron/stitch-kiosk-lunch-resume` also exists for manual/cron trigger).
  Emergency pauses outside the lunch window stay paused until an admin
  resumes. Do not strip auto-resume.
- **Elapsed breakdown** (Aug 10 2026): Live / History / Scan / Performance
  show work total plus segment details when a kiosk pause overlapped the
  session (Before lunch / Lunch off / After lunch). Closed `duration_sec`
  excludes pause windows. Do not collapse back to a single opaque total when
  pauses exist.
- **Admin employee work lookup** (Aug 19 2026): on stitch kiosk Performance,
  admin can pick one employee and see today / this week / this month (pieces,
  hours, Live now, piece list). Same Performance rules: closed sessions
  only; rejected overtime does not count. APIs
  `/api/production/sewing-session/employee-work` (admin session) +
  `/api/v1/production/sewing-session/employee-work`. Do not show this picker
  to stitch@ / pattern.
- **Admin floor dashboard** (Aug 19 2026): same Performance admin panel lists
  who **did not scan yet** vs who scanned (Today / Week / Month). Roster =
  active Expats who can use the kiosk and have a floor job (tailor / cutter /
  wash-iron / buttons). Pattern/QC/cleaner-only are not in Missing. A scan
  counts as present even if overtime was later rejected. Tap a name for
  day/week/month detail.
- **Stitch/Pattern change requests** (Aug 10 2026): stitch@ and pattern@ may
  request admin approval to **stop**, **edit**, **delete** a Live/History
  session, **delete** a failed-scan row, or **pause the whole kiosk**. Nothing
  mutates until admin Confirm on `/dashboard#sewing-session-change-requests`
  (Reject keeps data) or one-click Approve/Reject in the admin email /
  `/approvals` page. Store: `sewing_session_change_requests`. APIs:
  `POST /api/production/sewing-session/change-request` (request/cancel) +
  admin decide route + `/api/v1/...` parity. Events:
  `production.sewing_session_change_requested|approved|rejected`. Approved
  deletes use `allow_session_delete_ids` / `allow_failure_delete_ids` plus
  durable `deleted_session_ids` tombstones so protect-merge cannot
  resurrect rows. Overtime after 22:00 is `overtime_confirm` (scan already
  logged). Scan tab stays scan-only.
- **Stop requests close at request time** (Aug 17 2026): approved "stop"
  requests set `ended_at` = `requested_at` (`stopRequestEndedAt`), never the
  admin decision time - approval lag must not inflate elapsed. If the kiosk
  closes a session while a stop request is still pending, the close honors
  the requested stop time and auto-resolves the request
  (`consumePendingStopRequestForSession`), so stale "Session is no longer
  open" requests never linger on `/approvals`. Do not revert to closing at
  scan/approval time.
- **Workday cap 22:00 Riyadh** (Aug 18 2026, auto-close + overtime Aug 19):
  the floor finishes at 10 PM. Forgotten Live/open/closing sessions (no
  overtime scan) are **closed** at 22:00 of the start day
  (`applyWorkdayEndCloses`) via cron `/api/cron/stitch-kiosk-workday-end`
  (19:00 UTC) and Live poll. If the team is still scanning after 22:00
  (overtime, until 08:00), **keep the scan logged** and open an
  `overtime_confirm` admin request - do not drop it. Confirm counts it in
  Performance; Reject keeps the History row but drops Performance hours.
  Do not auto-close a session already marked overtime pending/confirmed.
  Do not treat a duration cap as "Live is empty at 10 PM".
- **Pattern can open the stitch kiosk** (Aug 9 2026): `pattern_operator` has
  `/stitch` in nav and the same kiosk APIs as stitch@ (sewing-session scan,
  work-order / sales-order reads only). Pause control stays admin-only. Do not
  strip this visibility without an explicit ask.
- Rejects must explain themselves (e.g. washing/fabric-cut QR scanned instead
  of production piece QR) and persist to `sewing_scan_failures`. A production
  piece QR that is simply not on the live list must **not** mention wash /
  prep stickers - that wording made the floor think a stitcher sheet was a
  washing sheet.
- **Old production A4 QRs stay valid after garment-type change** (Aug 18
  2026): QC Shirt LS -> Overshirt (and similar) regenerates `label_stickers`
  (SHT-LS -> OS). Already-printed stitcher sheets still encode the old piece
  code. Lookup keeps `previous_label_stickers` and also rematches the same
  article (`FR-0133-L06-SHT-LS` -> live Overshirt sticker). Do not require a
  reprint before the floor can scan. Wash/fabric-cut QRs (no piece suffix)
  stay rejected at stitch.
- **Scan durability (do not regress)**: every kiosk scan stays in
  `sessionStorage` (`hagan-sewing-scan-queue`) until the server durably
  accepts it (`ok` write) or records the reject (`failure_recorded`). Network
  / 401 / 403 / non-JSON errors must **not** dequeue. Wedge + partial buffers
  flush on `pagehide`. Server uses force-fresh `sewing_sessions` /
  `sewing_scan_failures` reads, retries failure persistence, and
  `protectSewing*Write` refuses accidental empty wipes (explicit testing reset
  via `allow_testing_reset` / `POST .../sewing-session/reset-testing` only).
- Employee/client names display short form when available. Client short
  labels are first + last, or title + first when a title is set
  ("Pr Khaled", not "Pr Salman"). Full legal name is title + first +
  middle + last.

## Pattern library

- **Pattern badge login** (Aug 18 2026): `/login` opens on the Email tab
  (he has used email for months). Mohtajul: `hagan.dp1@gmail.com` + either
  his old mailbox password or the badge password, or Badge tab
  `2625917972` + either password. Both create the badge session (not the
  old shared mailbox). Historical writes still label as Mohtajul.
  Temporary second operator until a real badge is issued: `XX22` + the
  password admin set. Do not require a numeric-only badge; alphanumeric
  temp IDs are valid.
- **Two ways to use a base for a client** (do not collapse into one):
  (1) on the base pattern page - client fit column (Use as base under a size);
  (2) on the client job measurement sheet - Load from base pattern into Sample.
  Same idea, different screens - keep both.
- **Client fit columns on base patterns** (owner request, Aug 2 2026): the
  size grid on `/pattern/library/bases/[baseId]` supports per-client columns.
  Pick a client in the "Client fit column" selector, tap "Use as base" under a
  size; an editable amber column appears next to that size with the client's
  adjusted measurements (placeholder = base value, deltas shown underneath).
  Stored as `client_columns` on the BasePattern (one per client per base) -
  saved via `/api/pattern/library/bases/[baseId]/client-columns` (PUT/DELETE)
  and `/api/v1/...` parity; events `base_pattern.client_column_saved` /
  `_removed`. The A4 working sheet + PDF accept `?client=` to print the
  client's column next to the base size. Do not strip this without the user
  asking.
- **"Load from base pattern" Sample fill** (pattern request, Aug 5 2026): the
  client sheet's Sample/Trials/Final toolbar has a "Load from base pattern"
  button - pick a library base (defaults to the sheet garment) and a size
  column or the client's fit column (preselected when the base has one), and
  the values copy into the editable Sample cells. Units convert cm <-> in
  (inches snap to 1/16"); points match by id / normalized name / dictionary
  aliases / unique containment, one base point claimed once - ambiguous rows
  stay empty and are listed in the notice. Copy is client-side; persistence
  is the existing Save sheet flow (no new write path, no new /api/v1 route
  needed). Helpers + tests: `src/lib/pattern-library/load-from-base.ts`.
- **Site-wide Pattern cm / inches** (Aug 8 2026): Pattern pages share one
  Units toggle (`erp-pattern-measurement-unit` localStorage). Sheets, bases,
  print previews, and PDFs (`?unit=`) show values in that unit via display
  conversion; edits convert back to each pattern's stored unit. Typed cell
  numbers mean the selected unit (not auto-detected) - pick cm or inches,
  then type. The Units toggle is display-only (does not rewrite stored
  numbers). New client/base patterns inherit the preference. Helpers:
  `useMeasurementUnitPreference`, `MeasurementUnitToggle`,
  `formatMeasurementForDisplay`. Ship: `0c2e27c`.
- **Historical sheets store inches** (Aug 8 2026): many filled client
  measurement numbers are inches (1/16"). If `unit` was wrongly `"cm"`,
  relabel to `"in"` without converting numbers; if numbers were accidentally
  converted to cm, convert them back to inches (`heal-measurement-unit.ts`,
  on pattern open + `scripts/relabel-inch-client-patterns.mjs`). Empty-sheet
  sibling heal must copy the source `unit` too. After restore, the Units
  toggle converts for cm display only.
- **Consolidate / create inherits Units toggle** (Aug 9 2026): auto-consolidate
  and every UI create path (manual consolidate, job Create & open sheet,
  fabric-board new pattern) must pass `unit` from
  `useMeasurementUnitPreference`. Never create with silent default `"in"`
  while Pattern is typing centimeters (76 cm must not be stamped as 76 inch).
  APIs accept optional `unit` (`/api/pattern/auto-consolidate`,
  `/api/v1/pattern/auto-consolidate`). Inverse heal: unit `"in"` but values
  look like cm (cm magnitude band) -> relabel to `"cm"` without converting.
- **Stored vs display unit must stay obvious** (Aug 9 2026): sheet UI shows
  "Show X | sheet stores Y (auto-converts)" next to the Units toggle.
  Toggle is display-only; cells convert on type. TUD / base fill must convert
  when `base.unit !== sheet.unit` (`fillMeasurementsFromBase` options).
  HTML print honors `?unit=` via `resolvePatternDisplayUnit` (same as PDF).
- **Base-pattern pickers must preload the slim payload** (perf fix, Aug 5
  2026): use `GET /api/pattern/library/bases` (bases + dictionary, ~218 KB)
  via `preloadBasePickerData()` in `base-picker-cache.ts` - never the
  full-store `GET /api/pattern/library` (2.5 MB, client_patterns dominate).
  Pages hosting a picker preload on mount so the dialog opens with zero
  network wait; the cache is invalidated after base create / fit-column
  save. Keep picker search client-side.
- **Pattern operator notices** (Aug 6 2026, How-to tab Aug 19): instructional
  how-tos appear at the top of `/pattern` until Pattern taps Got it, and are
  emailed to `PATTERN_EMAILS`. They stay on **Pattern -> How-to**
  (`/pattern/how-to`) after acknowledge. Catalog is `PATTERN_HOWTO_NOTICES`
  (newest first); `ensureAllPatternHowToNotices` seeds + emails any missing
  entry. Store `pattern_operator_notices`; APIs `/api/pattern/notices` +
  `/api/v1/pattern/notices` (`?status=all` for the tab) with events
  `pattern.operator_notice_created` / `pattern.operator_notice_acknowledged`.
  When we explain a floor fix to Pattern, add a catalog entry so they get
  the email and the tab - do not only tell the owner in chat. First notices:
  consolidate fabrics (`howto-consolidate-fabrics-v1`), remove one fabric
  from a group (`howto-remove-fabric-from-consolidation-v1`).
- **Pattern measurement saves must never wipe filled cells** (Aug 6 2026):
  Root cause was whole-document `pattern_library` upserts from a stale Vercel
  cache after Save. Hardening (keep all three):
  (1) `readPatternLibraryFresh({ force: true })` on every RMW;
  (2) atomic `trial_sheet_versions` sheet Save (one write, all trials);
  (3) Supabase write guard `protectPatternLibraryWrite` - merge against latest
  remote and **refuse** replacing a filled trial with an empty one, refuse
  wiping `client_patterns`, CAS retry on conflict. Marker seed on GET must
  re-read before write and only touch nest fields.
- **Pattern GET/list use warm cache; writes stay force-fresh** (Aug 10 2026):
  Sheet open and list endpoints call `readPatternLibraryCached()` (30s TTL).
  Never put heal/seed RMW on the sheet GET critical path - they run in
  `after()`. Do not open a sheet by downloading full `client-fabrics` board
  or the unslimmed library: sheet GET returns `linked_fabric_rows`; order
  board uses `GET .../client-patterns?client_id=&summary=1`; pickers use
  `GET .../bases`; library index slims measurement grids. Consolidate batch-
  links via `POST /api/pattern/jobs/link-client-pattern` (+ `/api/v1/...`).
  Save / fabric-assign / heal paths keep force-fresh + protect/CAS.
- **Pattern owns the client measurement sheet** (Aug 6 2026): on Sample /
  Trials / Final (and Trial detail), Pattern can add, rename, reorder, and
  remove any measurement row; edits sync across every trial. Cell writes
  upsert missing rows. "Load template points" works with or without a linked
  base and merges dictionary points onto all trials (keeps entered values).
  Do not re-lock row add/remove to a single trial or hide template load when
  `base_pattern_id` is set.
- **Trouser measurement template: Entire vs Reduced** (Aug 9 2026): when
  creating a trouser sheet (or Load reduced / Load entire on the sheet),
  Pattern chooses `measurement_template_mode`. **Reduced** (default) is the
  17 stitcher points: 1/2 Waist Relax, 1/2 Hip, Side pocket opening length,
  Front Rise, Back Rise, 1/2 Thigh, 1/2 Knee, 1/2 Bottom width, Inseam
  Length, Outseam Length (without Waistband), Fly Length, Waistband Height,
  Back Pocket width, Front Hip, Front Thigh, Front Knee, Front Hem.
  **Entire** is the full trouser dictionary. Reduced rebuild drops empty
  unused dictionary rows but keeps any row that already has values.
  **Compounds** (Overshirt+Trouser, Suit, Suit+Vest, Shirt+Trouser,
  Shirt+Trouser+Short, …): piece order from `getGarmentPieces`. Reduced =
  each non-trouser piece's full dictionary, then the 17 trouser points
  (deduped). Do not treat the word "Suit" as trouser-only. Shirt+Short /
  Thobe+Jacket have no trouser piece so they stay Entire-only (no Reduced
  control).
- **Set-garment measurement sheet: pick piece first** (Aug 9 2026): for
  compounds on one fabric article (Overshirt+Trouser, Shirt+Trouser,
  Shirt+Short, Suit, …) the Sample / Trials / Final (and Trial detail) UI
  shows a Piece select before the grid. Choosing Overshirt / Trouser / …
  shows only that piece's points (same allow-list as stitcher A4s). One
  garment per article stays a normal flat sheet with no select.
- **Trouser points stay on Trouser** (Aug 9 2026): Waist Relax / rises /
  inseam / bottom width are trouser-exclusive even if a shared id (e.g.
  overshirt `1-2-hem-width`) was mislabeled. Reduced OT templates use
  `bottom-width` for trouser bottom, not the overshirt hem id.
- **Top hem never lands on Trouser** (Aug 11 2026): the reverse of the rule
  above - `1-2-hem-width` matches the Trouser piece ONLY when the row name
  says "bottom" (legacy trouser sheets). Named "1/2 Hem Width" it is the
  overshirt/shirt hem and stays off Trouser views, prints, and piece-scoped
  copy/paste (`pointMatchesStitcherPiece`). Regressed once: an OT paste with
  Trouser scope appended the overshirt hem 63.2 onto a Shirt+Trouser sheet.
- **Copy sizes to consolidations** (Aug 9 2026): on a filled client sheet,
  tab **Copy sizes** lists other same-client + same-garment consolidated
  sheets and can overwrite (or fill-empty) their measurements + unit from
  this sheet. Tab shows amber **New** badge + **?** help tip (same pattern
  as Sewing A4s). API: `/api/pattern/library/client-patterns/[id]/copy-measurements`
  + `/api/v1/...` (event `client_pattern.measurements_copied`).
- **Copy sizes piece scope + board entry** (Aug 10 2026): for set garments
  (Overshirt+Trouser, Suit, ...), Pattern picks **Both / Overshirt only /
  Trouser only** (generic piece tokens) before copying. Same control on
  sheet **Copy sizes** tab, Pattern order board row **Copy sizes**, and job
  **Copy sizes**. Single-piece garments skip the piece picker. Do not
  require Pattern to open the sheet only to find copy.
- **Copy never adds clutter rows** (Aug 16 2026): copy/paste moves SIZES,
  not template rows - empty source rows are never copied (adding them
  spread 49-row dictionary bloat through every copy and sibling heal), and
  a filled source row is skipped when the target already has the same
  normalized label under a different point id ("1/2 Hem Width" == "1/2
  Hem", the twice-cleaned phantom 63.2 hem). Tests in
  `test:copy-measurements`. Do not re-enable empty-row propagation.
- **No duplicate labels from ANY row-adding path** (Aug 16 2026): the same
  `normalizeMeasurementRowLabel` guard also applies to template loads
  (`mergeTemplateMeasurements` skips template rows whose label lives on
  the sheet under another id) and to sheet creation
  (`buildMeasurementsFromTemplate` dedupes dictionary points by label -
  the legacy dictionary holds two "1/2 Hip" ids). Shifted-id sheets (hem
  stored on `1-2-shoulder` named "1/2 Hem") are valid data; fix labels,
  never bulk-rematch ids. Three legacy trouser sheets keep two filled
  "1/2 Thigh" values on one id awaiting a human pick - do not auto-drop
  filled duplicates.
- **Copy never blanks filled values** (Aug 10 2026): overwrite copy merges
  per point; a source row with no value must never null a filled target
  value (it only adds missing points). A wholesale replace once wiped
  Khaled OT 1/2 Waist 60.5 and it had to be restored from a printed sheet.
  Enforced twice: merge logic + `copyWouldLoseFilledValues` write guard in
  the copy mutation (skips the target and reports "Blocked ... it is a
  bug"). Regression tests: `npm run test:copy-measurements` - run them
  when touching copy-measurements-to-siblings.ts.
- **Copy works across garments via shared pieces** (Aug 10 2026): copy
  targets include same-client sheets whose garment shares a piece with the
  source (Overshirt+Trouser -> Overshirt-only, Overshirt -> OT, Shirt+
  Trouser via Trouser, ...). Cross-garment copies apply only the shared
  piece(s). Comments (`special_instructions`) travel with the sizes on
  every scope; the target keeps only its own article + fabric number. Do
  not restrict copy back to exact-garment matches - Pattern relies on
  OT -> Overshirt.
- **Paste sizes (pull direction)** (Aug 11 2026): board rows and the job
  page also have **Paste sizes** - opened on the row that RECEIVES the
  sizes, pick one filled source sheet, optional piece, paste. Same
  copy API/guards with source and target swapped. Pattern thinks in
  articles (L48), not pattern refs, so the pull direction must stay -
  do not remove it in favor of push-only Copy sizes.
- **Copy/Paste list must not 404 on degraded Supabase** (Aug 11 2026): a
  forced pattern-library read that fails returns an EMPTY store; the
  copy-measurements GET therefore reads warm cache first and answers 503
  ("Sheets are still loading") instead of 404 when the store is empty.
  Forms auto-retry once and guard against a stale request overwriting a
  newer one. Symptom if regressed: copy/paste window randomly says
  "Client pattern not found" or lists nothing.

## Printing

- When the user says "PO" they usually mean the **production A4 piece sheet**
  (`/orders/[id]/print?team=production`), not a fabric purchase order (no PO
  print route exists).
- A4 print rules: bare `(print)` layout (no DashboardShell), `@page` A4
  portrait 12mm, widths 100%, fonts in pt, Helvetica/Arial for print (Chrome
  embeds font-mono as Courier/Type3 and overlaps glyphs). **Never** use
  transform/zoom scale, `max-w-*` wrappers, or `break-inside: avoid-page` on
  tall blocks - they trigger shrink-to-fit tiny strips.
- Print dialog: A4 portrait, scale 100% / Actual size, default margins.
- Fabric swatch images on print sheets require the swatch manifest to ship
  into the Vercel image lambda (Caccioppoli fix `b5ac64f`); new fabric codes
  need a swatch download/sync before thumbs appear.
- **Every swatch image API must be in `FABRIC_SWATCH_ROUTE_PREFIXES`**
  (permissions.ts) or restricted roles get middleware 403 and the UI shows
  "No photo" while admins see images fine (hides the bug). Regressed Aug 11
  2026 when the Drapers proxy moved to `/api/suppliers/drapers/images` but
  only the old medias route was allowlisted. When adding/moving a swatch
  route, add the prefix there AND to the swatch-route list in
  `permissions.production.test.ts`.
- **Custom / one-off fabric filing A4** (Aug 9 2026): after Task creates a
  CF-YYYY-#### fabric (outside supplier / mill leftover), print
  `/custom-fabrics/[id]/print` — one A4 with fabric details and an empty
  **5x5 cm** square top-right to cut and glue a physical swatch for the
  file. No prices on the card. Print A4 from the create success banner or
  each Custom tab row.
- **Pattern order-board batch print** (Aug 9 2026): on `/pattern/orders/[soId]`,
  tick fabrics (Select all / subset), choose Production / Sewing / Cutter,
  then **Print selected** opens one preview with all selected jobs' A4s
  (`/pattern/orders/[soId]/print?sheet=...&jobs=...`). Do not force Pattern
  to open each job one-by-one after consolidate.
- **Sewing / production stitcher A4s**: one A4 per **stitcher piece**, not one
  page with every piece QR. Overshirt+Trouser / Suit / Shirt+Trouser print
  Overshirt (or Jacket/Shirt) on page 1 and Trouser on page 2 - each with that
  piece's floor QR + filtered measurements - so different stitchers get their
  own sheet. Single-piece garments (Shorts, Shirt, Thobe, ...) stay one page.
  **Print production** and **Sewing A4s** both open the fabric tick picker
  (Select all or subset) on the client sheet and job page; each ticked fabric
  gets its own QR pages via `?lines=`. Order board **Print selected** is the
  same idea across jobs. Browser print must page-break between stitcher A4s
  (production CSS matches sewing - do not force `page-break-after: auto` on
  multi-page production packs). Do not collapse back to first-linked-line-only
  or put Overshirt+Trouser QRs on one shared page.
- **Sewing A4s includes job-linked fabrics** (Aug 18 2026): the tick list is
  `linked_fabric_line_ids` PLUS any pattern job already opened onto that
  sheet (`client_pattern_id`). Transferred-in lines (e.g. Zegna 66046 on
  SO-2026-0129) can have sizes on the sheet while still missing from the
  old grouped 600xx list - they must still appear so Pattern can print.
  Opening the sheet also heals the missing line onto the pattern. Do not
  go back to grouped-ids-only.
- **Stitcher A4 rows must match the screen piece view** (Aug 16 2026): the
  piece A4 appends "orphan" rows (not owned by any piece) to the FIRST piece
  page so a Pattern-added custom point is never lost - but dictionary points
  tagged to OTHER garments are NOT orphans and must never print (the screen
  piece view hides them). Regressed on FR-0626-0037: 8 Shirt SS rows (Collar
  Height, Side Length, Sleeve Opening, Chest Pocket...) printed under the
  Overshirt A4 while the screen view was clean. Untagged dictionary entries
  stay orphan-eligible like custom points.
- **Orphan rule is SHARED between screen and print** (Aug 17 2026): the
  screen piece view once hid custom points entirely, so "+ Add point" on a
  set garment looked broken (row saved but invisible). Both the screen
  (`filterTrialSheetPointsForPieceView`) and the A4 print
  (`expand-cutter-print-pages.ts`) now call `trialSheetOrphanRows()` in
  `measurement-template-mode.ts` - custom rows show on the FIRST piece in
  both places, and Add point auto-jumps the sheet to that piece view. Do
  not re-implement orphan logic separately in either pipeline.
- **Cutter sheet = one A4 per fabric** (Aug 9 2026): Print cutter keeps nest +
  all piece floor QRs (Overshirt and Trouser) on **one** page. Do not split
  cutter by piece (that wasted a blank QR-only page). Multi-article masters
  still get one cutter page per fabric article. Densify nest so QRs stay on
  page 1 site-wide (print view + PDF).
- **Consolidated masters + fabric jobs**: N fabric jobs share one client
  pattern / measurements. After consolidate, always open sheet / Print A4
  from the **job** (or Master pattern link with that job's fabric) using
  `?job={jobId}&line={sales_order_line_id}` so fabric + floor QR stay on
  that article (e.g. L31 `722026` not a sibling `206155`). Never open the
  bare master URL to print one fabric. Never guess "most recently updated
  job" when multiple lines are linked. Master **Print cutter** without `job=`
  expands one page per linked article; stitcher packs use the tick picker
  (`?lines=`) or job scope. Pattern may later Remove one fabric from
  Grouped fabrics - that unassigns the line and unlinks the job; the
  remaining fabrics stay on the master.
- **Add fabrics from order on the sheet** (Aug 9 2026): on a client pattern
  Measurements toolbar, **Add fabrics from order** (and Grouped fabrics →
  Add from order) opens the client's SO fabric list to tick more lines onto
  this master. Uses `POST .../client-patterns/{id}/fabric-lines` (reassigns
  from other patterns). Do not force Pattern back to the fabric board only.
- **Empty measurement sheet heal**: if Pattern opens a fabric-linked /
  consolidated client pattern with no filled sizes, copy from the best
  same-client + same-garment sibling (Moussa House Thobe case). Also runs
  after fabric-line assign. Do not strip this heal.

## Fabric catalog colors

- **Loro Piana / Solbiati color from swatch** (Aug 10 2026): LP SS26 price-list
  JSON has no mill color field (all null). ERP fills display color from local
  swatch JPEGs (`data/suppliers/loro-piana/images`) via
  `loro-piana-swatch-colors.json` (script
  `scripts/extract-loro-piana-swatch-colors.mjs`). Catalog search, sales-order
  line normalize, Pattern fabric board, and sheets use
  `resolveFabricDisplayColor` when `color` is blank. Explicit stored colors
  win. Re-run the extract script after importing new bunches.

## Sales orders / invoicing

- **Money lock is admin-only** (Aug 18 2026): `canViewMoney` = `isAdmin`.
  Sales, accounting, QC, factory, and pattern may run invoice / costing /
  purchasing / supplier-invoice workflow, but they must never see selling
  prices, costs, payments, PO totals, outstanding SAR, or invoice PDFs.
  Server payloads redact amounts (view-source cannot leak). Non-admin PATCH
  cannot change unit price / qty / VAT / consolidate / payments. Zapier
  `/api/v1` API-key routes keep amounts for machine callers. Do not re-open
  the old sales/accounting eye-toggle for selling amounts.
- **Superseded sales orders** (Aug 11 2026): when a client order is
  re-entered (corrected lines/meterage), the old SO gets status
  `"superseded"` instead of being deleted - it keeps all lines and its
  original order date for factory reference (detail page shows a banner
  linking the replacement SO parsed from the notes). Superseded orders are
  excluded from the invoiceable-orders list/count, settle the fabric
  receiving floor, and are skipped by catalog stock/enrichment syncs;
  their pending pattern jobs must be cancelled ("Superseded by SO-xxxx")
  so the pattern board shows one set of articles. First case:
  SO-2026-0118 -> SO-2026-0125 (Abdelaziz Ajlan), invoiced once via
  INV-2026-0009. Do not delete superseded orders or re-open them to
  "fix" the invoiceable list.

## Inventory (trims / hangers)

- **Inventory tab** (Aug 16 2026, owner ask): `/inventory` tracks trims and
  accessories (first case: suit hangers vs laundry hangers) in the
  `inventory_store` erp_document - items with stock + low-stock threshold,
  per-garment-type **recipes** (e.g. Shirt LS -> 1 laundry hanger,
  Suit -> 1 suit hanger, Shirt+Trouser -> one of each), and a movement
  ledger.
- **Deduction happens at finishing -> packed** (stage-scan), NOT at cutting:
  hangers are consumed when the garment is packed. Dedup guard: the same
  sales-order line + item never deducts twice. Unknown garment types simply
  skip (no recipe = no deduction). Stock may go negative so the floor is
  never blocked; low stock fires `inventory.low_stock`.
- **Carton QR stickers** (Aug 17 2026): deliveries are registered as sealed
  cartons (N boxes x qty) which print an A4 QR sticker sheet. Sealed boxes
  are NOT stock - scanning the sticker when a box is opened
  (/inventory/cartons/[id] -> "Start using this box") adds its quantity
  with ledger reason `carton_opened`. Idempotent: a rescan never
  double-adds ("Already opened" + who/when). Do not add carton quantities
  to stock at registration time - open-scan IS the receive event.
- API parity per the Zapier rule: session routes under `/api/inventory/*`
  (items, adjust, recipes, cartons; production operators allowed) and
  API-key routes `/api/v1/inventory` + `/api/v1/inventory/adjust` +
  `/api/v1/inventory/cartons/open`. Events:
  `inventory.item_created/updated`, `inventory.stock_adjusted`,
  `inventory.recipe_updated`, `inventory.garment_deducted`,
  `inventory.low_stock`, `inventory.cartons_created`,
  `inventory.carton_opened`. Tests: `npm run test:inventory`.
- **Belt fabric basis** (Aug 17 2026): waistband consumption average is
  44 in (~112 cm) per trouser - kept as item `notes` on the six Belt
  fabric items and rendered under the name in the Stock on hand table.
  No automatic recipe deduction for belt fabric yet (brand per order is
  a manual choice).

## Clients

- **Title dropdown** before First (Mr, Mrs, Ms, Miss, Dr, Pr, Sheikh,
  Eng, Prof). Stored as `title`, not inside first_name. Short label is
  title + first ("Pr Khaled"); full name is title + first + middle +
  last. Legacy rows with Pr in first_name are lifted on read/save.
  Helper: `formatClientShortName`.
- **Name changes need admin approval** (Aug 17 2026): non-admins propose a
  rename via "Request name edit" on the Clients page; the proposal is
  stamped on the client (`name_change_*` fields) and applied only when an
  admin approves (dashboard panel or one-click email links). Bulk
  PUT /api/clients must always carry the stored `name_change_*` fields
  over - only the dedicated name-change-request endpoints mutate them.
- **One-click email actions**: the admin alert email carries per-recipient
  HMAC-signed approve/reject links (`name-change-email-token.ts`, 7-day
  expiry, bound to client + requested_at + recipient).
  GET `/api/clients/name-change-email-action` is session-exempt in the
  middleware (both isOpenAuthRoute lists) - the signed token IS the
  authorization; do not remove the exemption or the links 401.
  Stitch change requests and fabric-line delete requests use the same
  pattern via GET `/api/admin-approvals/email-action`
  (`admin-decision-email-token.ts`) plus the `/approvals` page. Email
  links must use erp.hagan.pro, never localhost.
  Tests: `npm run test:name-change`.

## Supplier emails

- QC and all teams see **Email sent / Email pending** status pills on
  `/fabric-orders` and `/orders` (status only, never the email body) so they
  can remind admin about unsent POs. Do not hide behind admin-only roles.
- Audit lives in `supplier-email-sent-audit.md`.
- **Never put client names in supplier emails** (LP chase, PO follow-ups,
  etc.). Use references only: FR code, SO, PO, line codes
  (e.g. `FR-0726-0037/0130-L28`). Owner rule Aug 5 2026.
- **LP chase line format** = what they print on the fabric, not what we
  stitch: `Fabric No.` + short **Code** (`FR-…/ 0xxx-Lxx`) + Labels +
  meters. Do **not** list garment types (Shirt / Overshirt / Trouser).
  Match the original PO email table. Owner rule Aug 5 2026.
- **Draft only — owner clicks Send**: prepare supplier chase/follow-up
  email text in chat (or in-app draft); do **not** SMTP-send unless the
  owner explicitly says to send. Owner rule Aug 5 2026.

## Mobile login UX

- **Post-login client photos prompt** (Aug 10 2026): on mobile/tablet
  (UA + coarse pointer / narrow width), after dashboard shell loads, accounts
  with `canAccessClientMedia` (admin, sales, client manager, production,
  pattern) see a once-per-browser-session dialog asking to upload client
  photos. Yes -> `/clients?mobileUpload=1`. Stitch kiosk and task-only
  accounts never see it. Do not remove without an explicit ask.
- **Every client-media role can UPLOAD client photos** (Aug 11 2026): the
  old pattern-only 403 on POST `/api/sales/client-photos` ("Sales uploads
  them") was removed on owner ask - Pattern shoots wearing photos on mobile
  too. Do not re-add an upload block for pattern. Hard delete stays
  admin-only (others request delete).
- **Client photo/video uploads must go direct to storage** (Aug 15 2026):
  Vercel caps API request bodies at ~4.5 MB, so multipart POST alone can
  never accept normal phone photos (platform 413 before our code runs; our
  15 MB / 50 MB limits are unreachable through the API). The browser asks
  `POST /api/sales/client-photos/upload-url` for a Supabase signed upload
  URL (erp-client-photos bucket), PUTs the file straight to storage, then
  `POST /api/sales/client-photos/register` verifies the object + size and
  attaches (or replaces) the photo. Local dev without Supabase storage
  answers `mode: "direct"` and the panel falls back to legacy multipart.
  Do not route uploads back through a Vercel function body, and keep the
  register-side size/filename re-checks.

## Deploy / infra

- **ASCII-only source files** - Vercel builds fail on invalid UTF-8.
- Supabase compute upgraded Nano -> Micro after Auth 522 outage; middleware has
  a 15s wall-clock timeout (must stay above the 3x4s inner auth-call caps).
- **Degraded auth must NEVER bounce a signed-in user to /login** (2026-08-18:
  pattern "cannot login" incident). When GoTrue times out / returns 0/5xx/429
  and the request carries a Supabase auth cookie, middleware serves a
  self-retrying 503 hold page ("Reconnecting to the server", meta-refresh 4s;
  APIs get 503 + Retry-After) via degradedAuthHoldResponse. Only a definitive
  GoTrue rejection (401/403) or a missing cookie may redirect to /login.
  resolveAuthUserDetailed reports the degraded flag - keep its tests green
  (resolve-auth-user.test.ts).
- **Badge login (pattern team)**: employees whose payroll job_functions
  include "pattern" sign in with badge/ID number + personal password
  (lib/auth/badge-login.ts). Password is set by the employee on first
  login, or by admin via upsertBadgeCredential /
  scripts/set-pattern-badge-password.mjs. Hashed in badge_login_credentials
  (5 wrong tries -> 10 min lockout). Each login is a real Supabase session
  on badge-pattern-<employeeId>@badge.hagan.pro (pattern_operator). Do NOT
  add those emails to PATTERN_EMAILS; isPatternOperatorEmail matches the
  badge pattern by regex. Both operators share one workspace; writes are
  stamped with sessionActor() as "Mohtajul (2625917972)" so admin can
  tell who changed a sheet. Typing hagan.dp1@gmail.com on the Email tab
  (or badge 2625917972) accepts the old mailbox password or the badge
  password and signs him in as the badge user. Old leftover gmail
  sessions are still cleared (isEmailLoginDisabled). Second operator
  temp ID: XX22.
- **Login log** (Aug 19 2026): admin sees who signed in or failed, time
  (Riyadh), device, and IP at `/logins` and on the dashboard. Email and
  badge attempts are recorded (no passwords). Store: `login_events`.
  GET `/api/auth/logins` (admin session) + `/api/v1/auth/logins` (API
  key). Events: `auth.login` / `auth.login_failed`. Historical attempts
  before this date are not available.
  /api/auth/badge-login stays in BOTH
  middleware open-route lists. Revoke: remove the credential or deactivate
  the employee.
- **Remove a fabric from a consolidation**: Grouped fabrics -> Remove
  unassigns that line and clears job.client_pattern_id. Do not leave the
  job linked or the fabric still looks grouped. Pattern How-to + email:
  `howto-remove-fabric-from-consolidation-v1`.
- Zapier parity rule: every business write path needs `/api/v1/...` +
  `notifyIntegration` (see `.cursor/rules/zapier-integration.mdc`).
- **Mem0 extra brain** (Aug 19 2026): Cursor MCP at mcp.mem0.ai. Store
  `Owner:` (user words) and `Agent:` (what shipped). Owner wins if they
  conflict. KNOWLEDGE.md remains the shipped source of truth. Do not
  store passwords or badge PINs.

## Session notes index

- [session-2026-08-19](session-2026-08-19.md) - Admin copy unlock, floor dashboard, Pattern How-to tab, 10 PM auto-close + overtime confirm, Kashif leftover, Mem0, pattern login
- [session-2026-08-05](session-2026-08-05.md) - Load from base pattern fills the Sample column on client sheets; picker preload perf
- [session-2026-08-04](session-2026-08-04.md) - Al Ajlan draft invoices prefilled with agreed proposal prices
- [session-2026-08-03](session-2026-08-03.md) - orange highlight for recently added custom fabrics
- [session-2026-08-02](session-2026-08-02.md) - stitch scan capture, job-aware labels, queue restore, A4 print, email pills
- [session-2026-07-08](session-2026-07-08.md) - supplier email per-line status, AWB tracker
- [session-2026-07-03](session-2026-07-03.md)
- [session-2026-06-25](session-2026-06-25.md)
- [session-2026-06-24](session-2026-06-24.md)
- [session-2026-06-21](session-2026-06-21.md)
- [session-2026-06-20](session-2026-06-20.md)
- [session-2026-06-19](session-2026-06-19.md)
- Other invariants: [client-profile-invariant](client-profile-invariant.md), [supabase-auth-resilience](supabase-auth-resilience.md), [sticker-print-fix](sticker-print-fix.md)
