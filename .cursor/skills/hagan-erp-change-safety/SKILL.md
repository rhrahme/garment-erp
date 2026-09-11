---
name: hagan-erp-change-safety
description: How to change this ERP without breaking the factory - blast radius of shared display and merge rules, what saved data a fix does and does not repair, pricing decisions that are not yours, what never gets committed, and the exact ship procedure. Use before editing shared logic and before every commit or deploy.
---

# Changing the ERP safely

## Fixing a rule does not fix saved data

Consolidation, invoice building and sticker generation **rewrite and save**
records. Changing the rule changes what happens next time; it does nothing to
what is already stored.

A merge key was corrected three times and the user saw no change, because the
flattened lines were already saved on the invoice. The repair path is
`rebuildInvoiceLinesFromSalesOrders`, which discards stored lines and regenerates
them. `syncInvoiceLinesFromSalesOrder` does NOT do this - it appends missing
articles and preserves stored prices.

**Whenever you change a rule that produced stored output, say explicitly what has
to be re-run to repair existing records, and make sure a path to do that
exists.**

## Know the blast radius before editing shared logic

Some functions look local and are not:

| Function | Also drives |
| --- | --- |
| `isSolbiatiFabric` | orders, receiving, production, stickers, fabric POs, supplier email batching |
| `normalizeFabricSupplierFields` | which supplier PO and email a line joins |
| `getGarmentPieces` | sticker count, pattern jobs, invoice set lines, worksheet piece totals |
| `resolveInvoiceVatRate` | every invoice total and the printed PDF |

`isSolbiatiFabric` currently prints "Stock" and "Stock-fabric" as Solbiati
because of its `/^S/i` fallback. That is known and was deliberately left alone:
tightening it changes stickers and POs for live orders. If a display problem can
be solved in the consuming module, solve it there.

## Pricing and policy are the owner's decisions

- Never change a price, a markup or a pricing rule unless told to.
- If a selling price looks wrong - below the cloth cost, for instance - report it
  with the arithmetic and stop.
- Never invent a mill price, and never invent Caccioppoli `35xxxx` prices. A
  missing price must show blank, never `SAR 0.00`, so it gets entered.
- Cost hints, fabric cost and margin are internal. They never appear on a client
  quote, invoice or any PDF that leaves the building.
- Never combine an invoice that is paid or carries a payment.

## Never commit

- Large `src/data/*.json` data dumps
- Generated PDFs
- Passwords, keys or secrets
- Scratch scripts. Delete them when the check is done.

ASCII only in any file Next compiles: no smart quotes, no em dashes, no accents.
There is a test that asserts this for the PDF helpers.

## Mirror business writes to v1

A new write endpoint under `src/app/api/...` needs a twin under
`src/app/api/v1/...` using `verifyApiKey`, and a `notifyIntegration` call so
ClickUp, Zapier and the activity log stay in step.

## Ship procedure

In this order. Do not report "shipped" before the last step passes.

1. `npm run test:consolidate-lines` and any suite covering what you touched.
2. `npm run build` - this also runs `audit:document-loads`.
3. Commit. One commit per logical change, descriptive message.
4. `git push -u origin <branch>`
5. `git push origin <branch>:main`
6. Wait for **both** Vercel projects to reach Ready: `garment-erp` and
   `garment-erp-kvsf`. Verify with
   `gh api repos/rhrahme/garment-erp/commits/<sha>/status`.
7. Append to `docs/session-<date>.md`:
   ``Ship: `<sha>`. Both Vercel Ready (`garment-erp`, `garment-erp-kvsf`).``

Pushing to `main` directly means there is usually no PR to open.

Do not force push. Do not amend. Do not edit an older PR's title or body. Reuse
the existing `github.com/rhrahme/garment-erp:main` CI subscription rather than
creating another.

## After shipping a UI change

Tell the user what to do to see it, and give them the tells that prove they are
looking at the new version - a new column, changed header text, a fixed label.
A user looking at a cached PDF and an agent describing new code will disagree
forever otherwise.
