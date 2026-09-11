---
name: hagan-erp-domain
description: What the words mean in this bespoke menswear factory - clients and codes, sales orders, fabric lines vs stickers vs articles, mills and supplier aliasing, the costing formula, production stages, patterns, and invoicing. Use on any task touching orders, fabric, costing, production, patterns, shipments or invoices.
---

# HAGAN ERP domain

A bespoke menswear factory. The order path is: client, sales order with fabric
lines, fabric POs to mills, inbound shipment, receiving, pattern jobs, cutting
and sewing, then invoice.

## Clients

Codes are `{PREFIX}-{MMYY}-{SEQUENCE}`, e.g. `FR-0626-0037`. The prefix comes
from the **first** brand id only: `gliani` GL, `fouad-rahme` FR, `fouad` FD,
`just-uniforms` JU (`src/lib/clients/codes.ts`). Sequence is the running max per
prefix, not per month.

**Pr Khaled Bin Salman is `FR-0626-0037`. Khaled Al Moussa is `FR-0426-0007`.**
Free-text search matches both. Filter by client code, never by name alone.

`client_kind: "retail_brand"` marks a ready-made account rather than a person.

## Sales orders

`SO-{YEAR}-{SEQUENCE}`. Statuses are `open`, `fabric_pos_created`, `complete`,
`superseded`. An order becomes `complete` when its invoice is marked sent or
paid, not when the last garment ships. `superseded` orders stay visible but are
excluded from invoicing and receiving. Archiving is separate and purely
time-based: older than 3 months by `order_date`.

### Fabric line vs sticker vs article

These three are constantly confused. They are not the same thing.

| Term | Meaning |
| --- | --- |
| **Fabric line** | One row on the order: one fabric, one garment type, some meters. The unit of ordering, costing, pattern jobs and receiving. |
| **Label sticker** | One barcode per garment **piece**. A Suit line produces two, a Shirt line one. |
| **Article** | The display label `L01`, `L02`. Taken from the sticker code, not from the array index. |

Article numbers persist in sticker codes even after earlier lines are deleted, so
**array index + 1 is not the article number**. Use `fabricLineArticleNumber` or
`soArticleFromFabricLine` in `src/lib/labels-codes.ts`.

Multi-piece garments expand through `getGarmentPieces`
(`src/lib/sales-orders/label-codes.ts`): Suit is Jacket + Trouser,
`Overshirt+Trouser` is two pieces, `Suit+Vest` is three. `Fabric only` is zero -
it is cloth sold without making, and it is not a garment.

`label_count` equals `label_stickers.length`. Changing a garment type regenerates
stickers but keeps the old codes in `previous_label_stickers`, so already-printed
QR codes still scan.

Ready-made is decided solely by `retail_brand` being set. Ready-made orders
cancel their pattern jobs, cannot append fabric lines, and throw if you try to
build a bespoke invoice from them.

## Mills, and why the brand can disagree with the supplier id

Every fabric line stores two different things:

- `supplier_id` - the **PO account**, used to batch supplier emails.
- `supplier_name` - the **display label** shown on stickers, sheets and invoices.

They legitimately disagree. `normalizeFabricSupplierFields` writes Solbiati linen
under `supplier_id: loro-piana` so it lands in one supplier email batch, while
the display name stays "Solbiati".

```ts
// src/lib/fabric-sourcing/supplier-display.ts
export function isSolbiatiFabric(supplierId: string, fabricNumber: string): boolean {
  if (supplierId === "solbiati") return true;
  if (supplierId === "loro-piana") return getLoroPianaMillLine(fabricNumber) === "solbiati";
  return /^S/i.test(fabricNumber.trim());
}
```

That last line means **any fabric number starting with S displays as Solbiati**.
So on one `supplier_id: canclini`, a fabric called "Stock" prints as Solbiati
while "BEY 008" prints as Canclini. Separately,
`resolveFabricSupplierDisplayName` maps `gliani-stock` and `gliani-warehouse` to
"Canclini", which is warehouse linen rather than real Canclini cloth.

**Never key business logic on the display name alone.** When identity matters,
key on supplier id **and** printed brand together.

Currencies: Zegna and Stylbiella quote USD, Gazaba AED, everyone else EUR
(`src/lib/currency/config.ts`). Convert with `toSar`. Mill prices are frequently
absent on the line itself - 190 of 221 lines on one client stored
`unit_price: 0` and the real price lived in the supplier catalog, reached through
`effectiveFabricUnitPrice` in `src/lib/costing/compute.ts`.

## Costing

Per fabric line, in `buildLineCost`:

```
fabric_base_sar  = unit_price x meters, converted to SAR
customs_duty     = 5% of base          (imported suppliers only)
import_vat       = 15% of (base + duty) (recoverable, excluded from cost)
fabric_cost_sar  = base + duty
total_cost_sar   = fabric_cost_sar + labor + washing + overhead
```

Labor, washing and overhead come per garment type from
`src/data/costing-rates.json`. Warehouse stock suppliers (`canclini`,
`wool-stock`) pay no duty or VAT.

The `meters` in that first line is the fabric line's `quantity`, and on
ClickUp-imported rows it is a garment count rather than a length - 62% of all
fabric lines read exactly 1. Read `hagan-erp-fabric-quantities` before quoting
or reconciling any meter figure.

The **cost hint** is this total per **piece**: `unitCostHintForFabricLine`
divides the line total by the sticker count. A combined multi-piece invoice line
carries the whole set's figure instead. On the worksheet,
`SAR/m x meters/pc + 5% duty = fabric cost`, and
`cost hint = fabric cost + make`.

Cost hints are internal. They must never appear on a client quote or invoice.

## Production

Work orders track one piece sticker through `received`, `fabric_prep`, `cutting`,
`sewing`, `washing`, `finishing`, `packed`, `completed`. Floor scans route
through `scanAtStation` in `src/lib/production/stage-scan.ts`.

Sticker codes:

- Full supplier sticker: `{client_reference}-L{nn}-{PIECE}` e.g.
  `FR-0426-0006-SO-2026-0008-L07-SHT-LS`
- Production code after re-labelling: `FR-0096-L07-SHT`
- Fabric-cut code, no piece suffix: `FR-0096-L07`

`client_reference` is `{client_code}-{so_number}`, generated when fabric POs are
created. Prep stickers are one per fabric cut; prod stickers are one per piece.

## Patterns

One pattern job per fabric line on bespoke orders, synced by
`syncPatternJobsFromSalesOrder`. The ERP is the source of truth: remove a line
and its job is cancelled. Jobs link by `sales_order_line_id`; library patterns
also carry explicit `linked_fabric_line_ids`.

## Invoicing

`buildDraftInvoiceFromSalesOrder` makes one line per sticker, except multi-piece
garments which become a single combined set line. VAT follows the **fabric
delivery destination**: RUH is 15%, DXB is 0%. Currency is always SAR.

`getInvoiceableSalesOrders` excludes ready-made, already-invoiced, archived and
superseded orders.

Marking an invoice sent or paid completes every covered sales order and settles
fabric receiving. That is hard to undo, so do not do it casually.

For how lines merge into articles, see the `invoice-line-merging` skill. The rule
in one line: same garment, composition, weight, mill and fabric price, or they
stay apart.
