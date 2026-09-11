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

## Two unknown prices are not the same price

`costHintMoneyKey` maps an absent figure to `"-"`. That correctly stops a priced
row merging with an unpriced one - but **two unpriced rows both key to `"-"` and
therefore match each other**. When the price is missing, the only things holding
the row together are composition and weight, and those are exactly the fields
most likely to be wrong on an unpriced line.

This produced a real, shipped error on INV-2026-0018. One row printed as

```
L11 x6  Overshirt+Trouser  50023, 50015, 66046, 50017, 66044, 59215
        Zegna  71% Wool 15% Silk 14% Linen  250 gsm
```

Those six Zegna numbers are, per Zegna's own price list, four different
compositions, three different weights and three different prices:

| Number | Catalog row | Composition | Weight | Price |
| --- | --- | --- | --- | --- |
| 50023 | 50021-50034 | 71/15/14 wool-silk-linen | 260 gsm | USD 137.30 |
| 50015, 50017 | 50014-50020 | 71/**17**/**12** | 240 gsm | USD 164.60 |
| 66044, 66046 | 66044-66046 | **100% Linen** | **360 gsm** | USD 163.40 |
| 59215 | 59214-59222 | **62% Silk 38% Linen** | 260 gsm | USD 128.80 |

The merge key did exactly what it was told. The stored composition and weight
were wrong, identically wrong on every line, so the rows looked identical.

**When the fabric price is missing, do not merge.** An unpriced row has not
earned the right to be collapsed into another one.

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
