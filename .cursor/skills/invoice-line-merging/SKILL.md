---
name: invoice-line-merging
description: The rule for merging garment lines on a customer invoice or a cost hint worksheet. Use whenever consolidating, combining, grouping, deduplicating or renumbering invoice lines, or when changing a merge key, or when a worksheet row looks wrong.
---

# Invoice line merging

## The rule

Two garments merge into one article ONLY when every one of these is the same:

1. Garment type (Trouser with Trouser, Short with Short)
2. Composition
3. Weight in gsm
4. Mill
5. Fabric price

If any one of them differs, they are two separate articles. No exceptions.

The worksheet key adds the cloth price per meter and the meters per piece, since
a merged row prints one of each. Two rows reaching the same cost from different
cloth (SAR 200 x 2m vs SAR 400 x 1m) are different fabrics and stay apart.

## Missing data never merges

A line with no composition, or no weight, or no mill is NOT lumped in with the
lines that have that data. It keys to `null` and stands on its own. A Canclini
trouser with unknown composition must never end up on the same row as a Zegna or
Loro Piana trouser. Rows with unknown data are a data-entry problem to surface,
not a gap to fill by guessing.

## Why price and mill belong in the key

A merged row prints ONE mill and ONE price. If the merge key ignores them, two
rows with different mills or different money collapse into one and the differing
figure is silently discarded or zeroed. That is data loss, not consolidation.

## Mill identity is supplier id AND printed brand

One supplier id can print under two different names. `isSolbiatiFabric` makes any
fabric number starting with `S` print as "Solbiati", so on a single
`supplier_id: canclini` a "Stock" fabric shows as Solbiati while "BEY 008" shows
as Canclini. Key the mill on the supplier id *and* the displayed brand, never on
the supplier id alone.

## Where this lives

- `src/lib/invoicing/consolidate-lines.ts` - `buildConsolidationMergeKey`
- `src/lib/invoicing/line-reduction-suggestions.ts` - `reductionOptions`
- `src/lib/costing/cost-hint-worksheet.ts` - `costHintInvoiceGroupKey`

## Changing the key does not fix stored invoices

Consolidation rewrites and SAVES invoice lines. An invoice built under an old key
still holds the flattened lines. Fixing the key changes nothing already saved -
the invoice must be rebuilt from its sales orders.

`syncInvoiceLinesFromSalesOrder` does NOT do this. It appends missing articles and
preserves stored unit prices and quantities, matching by article number. Use
`rebuildInvoiceLinesFromSalesOrders`, which discards the stored lines entirely.

## Before claiming a merge is fixed

Prove it against `src/data/sales-orders.json`. Count the lines in and the
articles out, and name a row that used to merge wrongly and no longer does. Do
not report a fix from reading the code alone.

That file is a stale snapshot, not production. It is good enough to prove a
grouping rule, and it is not evidence about what is on the user's screen. See the
`hagan-erp-evidence` skill.
