---
name: hagan-erp-fabric-quantities
description: Where fabric meters in this ERP actually come from, why "received meters" is not a measurement, and why most lines read 1 m. Use before quoting, costing, reconciling or reporting any meter figure, or answering "how much fabric did we order/receive/use".
---

# Fabric quantities: what the numbers actually mean

Every meter figure in this ERP traces back to **one** field: `quantity` on the
sales order fabric line. Nothing else measures cloth. Receiving does not, the
floor does not, the worksheet does not. If `quantity` is wrong, every meter
number downstream is wrong in exactly the same way, and they will all agree with
each other, which makes the error look like corroboration.

Before you quote a meter figure to anyone, know which of the three problems
below applies to the rows you are looking at.

## 1. "Received meters" is not a measurement

Receiving copies the ordered quantity and calls it received:

```ts
// src/lib/production/fabric-receiving.ts - and at three other call sites
fabric_meters: line.quantity,
```

It appears at lines 120, 333, 442 and 522 of that file, again in
`sticker-scan.ts`, and again in the ClickUp importer. The scan path never asks
anyone for a number: `fabric-receiving-scan.ts` does not contain the string
`meters` at all, and `createFabricReceipt` stamps `fabric_meters: line.quantity`
onto the new receipt alongside the timestamps.

So a fabric receipt answers "how many meters did we **order**", echoed back with
a received date on it. It cannot answer any of these:

- how many meters the mill actually shipped
- how many meters the store actually counted
- whether the cut piece was short, or whether there is leftover

**Never tell anyone a receipt figure is what was received.** If someone asks how
many meters arrived, the honest answer is that the ERP does not capture it -
there is no field for it and no screen that asks for it. Say that plainly rather
than reading `fabric_meters` aloud, because reading it aloud sounds like an
answer and is not one.

## 2. Most of `quantity` is a garment count, not meters

The ClickUp importer maps a field called "Unit" into `quantity` and then
hardcodes the unit as meters:

```ts
// src/lib/integrations/clickup/import-orders.ts
const quantity = getNumber(subtask.custom_fields, "Unit") ?? 1;
// ...
quantity,
unit: "meters",
```

ClickUp's "Unit" is how many garments were ordered. In the 958 cached ClickUp
tasks the field is filled on 92% of fabric subtasks, and its values are
`1` x747, `2` x45, `3` x4, plus a handful of 5, 8, 10 and 13 - integers, never
decimals. Broken down by garment it is unmistakable: 184 Trousers at "1", 143
Overshirts at "1", 54 Suits at "1". A suit is not one meter of cloth.

**ClickUp has no meters field at all.** The full custom-field list on a fabric
subtask is Fabric Number, Unit, Composition, Item, Color, Fabric Brand, Size,
Weight (grms), Tailor, the trial and delivery dates, and the process checkboxes.
Nothing measures length. So the importer had nothing correct to map, and mapped
a piece count instead.

The damage is visible in the data. Of 1886 fabric lines, **1169 (62%) say
exactly 1 meter** and 74% are whole numbers. Of 1358 fabric receipts, **1149
(85%) say exactly 1 meter**. Every one of the 49 Zegna receipts in the entire
history says exactly 1:

| supplier | receipts | distinct meter values | share at exactly 1.0 |
| --- | --- | --- | --- |
| Zegna | 49 | 1 | 100% |
| Drapers | 240 | 3 | 97% |
| Loro Piana | 221 | 7 | 85% |
| Solbiati | 142 | 14 | 71% |
| Caccioppoli | 31 | 6 | 39% |

Lines created or edited in the ERP itself are fine - `OrderFabricLineEditor`
labels the input "meters", validates it, and writes real decimals like 1.8 and
3.5. So `quantity` is a **mixed column**: ERP-entered rows hold true meters,
ClickUp-imported rows hold a garment count. You cannot tell which is which from
the value alone, though a whole number on a multi-piece garment is a strong
tell.

## 3. The worksheet column is per piece, not per garment

The cost hint worksheet prints a column headed `Meters/pc`, and it is a division:

```ts
// src/lib/costing/cost-hint-worksheet.ts
const meters = input.meters > 0 ? input.meters / pieces : null;
```

`pieces` is `pieceCountForFabricLine`, the sticker count. This is deliberate -
fabric cost is carried per piece, so `SAR/m x meters/pc + 5% duty = fabric cost`
only reconciles if the meters are divided too.

But it means a **multi-piece article prints a fraction of its cloth**. An
`Overshirt+Trouser` line holding a real 3.5 m expands to two pieces and prints
`1.75 m`. A 2 m line on two pieces prints `1 m`. To anyone who cuts cloth for a
living those numbers are impossible, and they are right - they are just not
reading what the column means.

When you show a meter figure to a person who makes garments, give them the
**line total**, or say "per piece" in words. Do not hand over a `Meters/pc`
value and let the header carry the explanation.

## How to answer a meters question honestly

1. Find the sales order fabric lines for that fabric - `quantity` and `unit` are
   the only real inputs.
2. Check whether the values look like meters (decimals, varying) or like a
   garment count (all 1s and 2s on multi-piece garments).
3. If you quote a receipt, say it is the ordered figure echoed back, not a
   measurement.
4. If you quote the worksheet, multiply back up by the piece count, or label it
   per piece.
5. Quote the `updated_at` of whatever snapshot you read - see
   `hagan-erp-architecture` for why.

## Worked example: fabric 50024

As of the `2026-08-04` snapshot, five lines carry Zegna 50024:

| SO | client | garment | quantity |
| --- | --- | --- | --- |
| SO-2026-0131 | Pr Khaled Bin Salman | Jacket | 2 |
| SO-2026-0130 | Ibrahim Al Shwemi | Jacket | 1.8 |
| SO-2026-0130 | Ibrahim Al Shwemi | Overshirt | 1.8 |
| SO-2026-0124 | Ibrahim Al Shwemi | Jacket | 1.8 |
| SO-2026-0123 | Pr Khaled Bin Salman | Overshirt+Trouser | 3.5 |

10.9 m ordered in total, 5.5 m of it for Pr Khaled. These are decimals, so they
were entered in the ERP and are probably true meters. **There is no receipt row
for 50024 anywhere in the 1358 receipts**, so as of that snapshot the ERP does
not record it arriving at all - and even if it did, point 1 applies.

The `3.5` on SO-2026-0123 is where the worksheet's `1.75 m` came from: 3.5
divided by the two pieces of an `Overshirt+Trouser`. Nothing was invented, and
nothing was received-scanned either.
