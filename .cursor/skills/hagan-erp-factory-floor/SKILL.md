---
name: hagan-erp-factory-floor
description: The stitch kiosk, sewing session state machine, scan pipeline and fabric receiving flow. Covers the session statuses and legal transitions, pause-aware elapsed time, the protect-write guards that stop a stale cache wiping the floor, and what sessions do and do not feed. Use before editing anything in src/lib/production.
---

# The factory floor

This subsystem runs against real people scanning real QR codes on a real floor.
A session that gets lost is a tailor's work that nobody can reconstruct at the
end of the day. Read before editing `src/lib/production/`.

## What sessions actually feed - and what they do not

**Sewing sessions do not compute anyone's pay.** Verified: `duration_sec`
appears in no file under `src/lib/hr/`, and the payroll register loads a fixed
`salary_amount` imported from a spreadsheet. Payroll adjustments are manual
admin entries.

What sessions do feed is **Performance** - per-employee piece counts and
durations on the floor dashboard. Only closed sessions count, and rejected
overtime is excluded:

```ts
function countsTowardPerformance(row: SewingSession): boolean {
  return row.status === "closed" && row.overtime_status !== "rejected";
}
```

The coupling to HR is identity only: `employeeCanSewOnStitchKiosk` decides who
may scan, and badge lookup resolves the name.

So do not tell a user that a session bug changed someone's wages. It changes
their performance record, which matters, but it is not the payslip.

## The state machine

Four statuses: `open`, `closing`, `closed`, `abandoned`. The `abandoned` status
exists in the type and in UI labels but no writer that sets it was found - treat
it as legacy until proven otherwise.

A session opens from two directions, and both exist because the floor does both:

- badge scanned first, arms for 30s, then the garment A4 -> `open`
- A4 scanned first, arms for 30s, then the badge -> `open`

Closing is two-step by design. Re-scanning arms `closing` and records
`closing_confirm` as either `"badge"` or `"piece"` depending on which came
first; the matching second scan completes it. If nobody confirms within 30s the
session drops **back to `open`** rather than closing. That reversion is
deliberate - do not "fix" it into a close.

Two more transitions matter:

- an armed badge followed by the same A4 can close an `open` session directly,
  but only after a 2 second grace (`ARMED_OPEN_A4_CLOSE_GRACE_MS`) so a
  double-scan at start does not instantly close what it just opened
- at 22:00 Riyadh, `applyWorkdayEndCloses` closes forgotten sessions, unless
  overtime is `pending` or `confirmed`

## Elapsed time subtracts pauses, in one path only

`sewingSessionElapsedSecExcludingPauses` merges admin pause windows with the
scheduled 14:00-16:00 Riyadh lunch and counts only work segments. Kiosk close
uses it.

**Admin stop and edit do not.** `applyEditPatch` recalculates `duration_sec` as
plain `ended_at - started_at` via `durationBetween`, with no pause exclusion.
That split is real and currently intentional-looking; know which path you are
touching before you change either, and do not unify them without asking.

## The protect-write guards are load-bearing

`protect-sewing-document-write.ts` exists because of a known class of bug, and
its own header says so: a stale Vercel cache doing a whole-document upsert must
never wipe open arms, sessions or the failure log. It blocks four things:

- an empty write when the remote has data
- a short write - remote-only sessions get merged back in, which is what makes
  two kiosks scanning at once safe
- **reopening a closed session** - remote `closed` cannot be downgraded to `open`
- resurrecting a tombstoned session

`protect-sewing-session-change-requests-write.ts` does the same for pending
admin approvals. Both throw rather than silently repairing.

Do not remove, bypass or "simplify" these. The only legitimate escape is
`allow_testing_reset: true`. If your write is being rejected, your write is
wrong.

## Scan codes

| Scan | Shape | Notes |
| --- | --- | --- |
| Garment piece (A4) | `FR-0096-L07-SHT` | `/^[A-Z]{2}-.+?-L\d{2}-[A-Z]/` |
| Fabric cut / prep | `FR-0109-L32` | line-level, **rejected at the stitch kiosk** |
| Employee badge | `EMP:{id}`, plus `EMPALT:`, `EMPIRON:`, `EMPBTN:` | |
| Attendance wall | `ATTEND`, legacy `HAGAN-HERE` | |
| Workstation | `PL-{line}-{machine}`, legacy `L{n}-W{nn}` | rejected at stitch |

Sticker codes are generated one per garment piece and stored on the sales order
line as `label_stickers[].code`. Retired codes are kept in
`previous_label_stickers` so an old printed sticker still resolves. Codes are
never reused across pieces.

Malformed scans are not swallowed: they append to `sewing_scan_failures`, which
is an append-only audit, and `sewing-scan-code-explain.ts` turns them into a
message a floor operator can act on. Keep that audit append-only.

## No HTTP-level idempotency

There is no idempotency key on `/api/production/sewing-session/scan` and no
dedupe by code plus time window. Protection against double scans is entirely in
the state machine: the 2 second grace, the arm TTLs, and the ambiguity reject
when two stitchers hold the same piece open. If you add a retry anywhere on the
client, you are adding a new failure mode.

## Fabric receiving, in order

pending -> print A4 and prep and prod stickers -> scan at `receive` -> prep
route (wash, soak, iron) -> handoff, which creates the per-piece production work
orders -> cutting, sewing, garment wash, finishing, packed.

**Settle** is the cleanup: when a sales order is marked complete, leftover
receipts move off the active floor, get archived, and their work orders are
marked completed. It preserves history rather than deleting it.

## Reset paths destroy history

`resetSewingSessionsForTesting` with `clear_history: true` deletes closed
session history. `resetFabricReceivingForTesting` removes receipts and work
orders. Both are gated to admin or client manager and both emit integration
events, but neither is undoable. Never call either to "clean up" state you find
confusing.

`correct_start_time` applies immediately when the request is created - admin
approval is an acknowledgement, not a gate. A bad corrected start inflates hours
on the performance record straight away.

## Tests

Only two are wired: `npm run test:sewing-session` and
`npm run test:sewing-scan-explain`. Twenty-five more exist and run from nothing.
Before shipping a change here, run the ones that cover it:

```
node --experimental-strip-types --experimental-loader ./scripts/tsconfig-paths-loader.mjs --test src/lib/production/sewing-session-pause-elapsed.test.ts
node --experimental-strip-types --experimental-loader ./scripts/tsconfig-paths-loader.mjs --test src/lib/production/protect-sewing-document-write.test.ts
node --experimental-strip-types --experimental-loader ./scripts/tsconfig-paths-loader.mjs --test src/lib/production/sewing-session-change-requests.test.ts
node --experimental-strip-types --experimental-loader ./scripts/tsconfig-paths-loader.mjs --test src/lib/production/sewing-employee-work.test.ts
```

Also `npm run verify:label-counts`, which guards garment type to sticker count.
Get that wrong and the floor scans fail because the piece QR does not exist.
