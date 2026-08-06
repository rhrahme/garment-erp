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
- **ID badges carry two QRs**: `EMP:{id}` (normal sew) and `EMPALT:{id}`
  (alteration). Alteration QR arms the next piece as `work_kind=alteration`;
  Live/History/Orders highlight **Alteration** (amber) without replacing
  job_functions. USB wedge reassembly must treat `EMPALT` / `EMPALT:` as
  partial fragments (never collapse to `EMP:`). Starting an alteration
  session writes `pattern_alteration_pending` (idempotent per session) and
  notifies Pattern (`production.alteration_started` /
  `pattern.alteration_chart_pending`) for that article + same-fabric siblings
  on the SO (article # from sticker L## when present). Pending write/notify
  failures must not fail the stitch scan; `/pattern` heals missing rows from
  open alteration sessions. Pattern clears via Acknowledge / Chart updated.
  Pattern is not required before the tailor starts. Pattern enters stitcher
  comments on the client measurement sheet (per-line Remark + bottom Stitcher
  comments) and/or from the alteration queue; those print on the Production /
  stitcher A4. **Badge layout**: QRs are 20mm with full labels **SEWING** /
  **ALTERATION**, centered as a pair with a fixed **3cm** clear gap between
  code edges (not opposite card edges, not abbreviated SEW/ALT). Reprint
  Expats badges after dual-QR / layout changes.
- **All employees on the Expats ID badge list may use the kiosk** - cutters,
  wash/iron, buttons, not only tailors. Do not re-add a tailor-only gate.
- **Multi-arm queue is intentional**: several employees may be badge-ready at
  once; the next A4 scan assigns to the most recent badge (`mostRecentArm`).
  This was removed once (`09033b3`) and restored (`c158f4b`) - do not remove again.
- USB wedge capture must always steal rapid keystrokes (even over selection or
  focused fields) and show an optimistic "Last scan" strip on every tab.
  Silence on scan is a bug, never acceptable.
- Rejects must explain themselves (e.g. washing/fabric-cut QR scanned instead
  of production piece QR) and persist to `sewing_scan_failures`.
- Employee/client names display short form when available.

## Pattern library

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
- **Base-pattern pickers must preload the slim payload** (perf fix, Aug 5
  2026): use `GET /api/pattern/library/bases` (bases + dictionary, ~218 KB)
  via `preloadBasePickerData()` in `base-picker-cache.ts` - never the
  full-store `GET /api/pattern/library` (2.5 MB, client_patterns dominate).
  Pages hosting a picker preload on mount so the dialog opens with zero
  network wait; the cache is invalidated after base create / fit-column
  save. Keep picker search client-side.
- **Pattern operator notices** (Aug 6 2026): instructional how-tos appear at
  the top of `/pattern` until Pattern taps Got it, and are emailed to
  `PATTERN_EMAILS`. Store `pattern_operator_notices`; APIs
  `/api/pattern/notices` + `/api/v1/pattern/notices` (create/list/ack) with
  events `pattern.operator_notice_created` /
  `pattern.operator_notice_acknowledged`. First notice explains consolidate
  fabrics then add/link pattern (`howto-consolidate-fabrics-v1`).
- **Pattern owns the client measurement sheet** (Aug 6 2026): on Sample /
  Trials / Final (and Trial detail), Pattern can add, rename, reorder, and
  remove any measurement row; edits sync across every trial. Cell writes
  upsert missing rows. "Load template points" works with or without a linked
  base and merges dictionary points onto all trials (keeps entered values).
  Do not re-lock row add/remove to a single trial or hide template load when
  `base_pattern_id` is set.

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

## Deploy / infra

- **ASCII-only source files** - Vercel builds fail on invalid UTF-8.
- Supabase compute upgraded Nano -> Micro after Auth 522 outage; middleware has
  a 10s wall-clock timeout.
- Zapier parity rule: every business write path needs `/api/v1/...` +
  `notifyIntegration` (see `.cursor/rules/zapier-integration.mdc`).

## Session notes index

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
