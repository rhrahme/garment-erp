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

## Deploy / infra

- **ASCII-only source files** - Vercel builds fail on invalid UTF-8.
- Supabase compute upgraded Nano -> Micro after Auth 522 outage; middleware has
  a 10s wall-clock timeout.
- Zapier parity rule: every business write path needs `/api/v1/...` +
  `notifyIntegration` (see `.cursor/rules/zapier-integration.mdc`).

## Session notes index

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
