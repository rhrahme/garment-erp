---
name: hagan-erp-accounting
description: The money rules of this ERP - two legal entities, VAT and customs duty, the payment ledger, supplier and transporter invoices, currency and rounding, and who is allowed to see any of it. Use on any task touching invoices, payments, VAT, costing, supplier billing, customs, payroll or financial PDFs.
---

# HAGAN accounting

Nothing here is generic finance. These are the rules this factory actually runs
on, and most of them are enforced in code that is easy to break.

## Two legal entities, chosen by fabric destination

The invoice is issued by a different company depending on where the fabric was
received. `delivery_destination` drives it, not the client's address.

| Destination | Issuer | Currency shown | VAT |
| --- | --- | --- | --- |
| `RUH` (Riyadh) | Hagan Industries Company, Riyadh | SAR | 15% |
| `DXB` (Dubai) | Vitasartoria Ltd, Dubai | SAR, payable in DHS | none |

`getInvoiceIssuerDetails` and `getInvoiceBankDetails` in
`src/lib/invoicing/bank-details.ts` return the right issuer and the right bank
block. **Do not hardcode or copy IBANs anywhere else**, and do not reproduce them
in docs, comments, commit messages or chat. One module owns them.

Getting the destination wrong puts the wrong company and the wrong bank account
on a client invoice. Treat it as a correctness bug, not cosmetics.

## VAT

```ts
// src/lib/invoicing/vat.ts
export const SAUDI_VAT_RATE = 0.15;
export function resolveInvoiceVatRate(destination) {
  return isSaudiInvoiceDelivery(destination) ? SAUDI_VAT_RATE : null;
}
```

15% applies to the subtotal excluding VAT, and only for RUH. Dubai returns
**`null`, not `0`** - null means no VAT line on the document at all. Preserve
that distinction; a zero renders a VAT row claiming zero tax.

There is **no ZATCA e-invoicing integration in this repo**. Do not claim the
invoices are ZATCA compliant, and do not invent QR codes, UUIDs or hashes for
them. If asked, say it does not exist.

## Import duty vs import VAT - the one accountants care about

From `src/data/costing-rates.json` and `computeFabricImportCost`:

- **5% customs duty is a permanent cost.** It is included in `fabric_cost_sar`.
- **15% import VAT is recoverable.** It is paid at customs, reclaimed later, and
  therefore **excluded** from garment cost. It is tracked separately as
  `vat_recoverable_sar` and `fabric_cash_outlay_sar` because it ties up cash for
  months.

Warehouse stock suppliers (`canclini`, `wool-stock`) are already in the Kingdom
and pay neither.

Never fold import VAT into cost, and never drop the duty from it.

## The payment ledger

Statuses are `draft`, `sent`, `paid`. Methods are `cash`, `transfer`, `card`,
`other`; anything else normalizes to `null`.

```ts
// src/lib/invoicing/payments.ts
export function getInvoiceAmountPaid(invoice): number {
  const recorded = sum of normalized payments;
  if (recorded > 0) return recorded;
  if (invoice.status === "paid") return roundInvoiceMoney(invoice.total);
  return 0;
}
```

That fallback matters: **legacy invoices marked paid with no payment rows count
as fully paid.** Do not "fix" it by returning 0, and do not assume an empty
`payments` array means nothing was received.

Payments with a non-finite or non-positive amount are dropped by
`normalizeInvoicePayments`. Every write path should go through
`withNormalizedPayments`.

Balance due is `max(0, total - amountPaid)` - it never goes negative, so an
overpayment does not show as a credit anywhere. If the business needs credits,
that is a new feature, not a rounding tweak.

### Things that must not happen

- Never combine an invoice that is `paid` or carries any payment.
- Never rebuild lines on an invoice with payments against it.
- Marking an invoice `sent` or `paid` sets every covered sales order to
  `complete` and settles fabric receiving. That cascades into the production
  floor lists and is not casually reversible.

## Supplier, transporter and customs billing

Inbound supplier invoices arrive by email and land in
`src/lib/integrations/supplier-invoice-store.ts`. Note the shape:
`SupplierInvoiceRecord.amount` is a **`string | null`** parsed out of a PDF, not
a number. Do not arithmetic on it without parsing and validating, and do not
assume the currency matches the invoice.

Customs status is `paid`, `payment_due`, `pending` or `unknown`
(`computeCustomsSummary`). `unknown` is not `pending` - do not collapse them.

The local store is the gitignored root file `supplier-invoices.local.json`. Never
commit it, and never commit anything under the invoice file storage directories.

## Who can see money

One gate, admin only:

```ts
export function canViewMoney(session): boolean {
  return Boolean(session.isAdmin);
}
```

The **accounting role is not admin**. Accounting sees the invoicing, costing,
supplier-invoice and purchasing workflow with every amount redacted. That is
deliberate.

Every response carrying money must pass through the right redactor:

| Payload | Redactor |
| --- | --- |
| Customer invoice | `customerInvoiceForSession` |
| Supplier invoice | `supplierInvoiceForSession` |
| Costing overview | `redactCostingOverview` |

`redactSupplierInvoiceMoney` also nulls nested transporter amounts and the
customs `amount_due` / `amount_paid`. When you add a nested money field, add it
to the redactor in the same commit or it leaks.

Payroll is money too. `maskAccountNumber` exists for a reason; employee bank
details are admin-only.

## Currency and rounding

Invoices are always denominated in SAR. Supplier prices are in the mill's
currency - Zegna and Stylbiella USD, Gazaba AED, everyone else EUR - converted by
`toSar` at book rates from `src/lib/currency/config.ts`. Dubai clients pay in
dirhams via `sarToDhs`.

Round money with `roundInvoiceMoney` (2 decimals) and nothing else. Do not round
intermediate values: rounding meters per piece to 3 decimals threw the fabric
cost off by 6 halalas on 5 of 182 lines. Keep full precision in stored values and
round only for display.

Format with `formatInvoiceSar` on screen and `formatInvoiceSarForPdf` in PDFs
(plain ASCII comma and period, never a non-breaking space). Whole numbers drop
the decimals; fractional amounts always show exactly two.

## What never reaches the client

- Cost hints, fabric cost, mill prices and margin are internal. They belong on
  the cost hint worksheet, which is headed INTERNAL and footed "not a client
  invoice". They never go on a quote, an invoice, or any outgoing PDF.
- A missing price shows **blank**, never `SAR 0.00`. A zero reads as free.
- Never invent a mill price to fill a gap, including Caccioppoli `35xxxx`.

## Reporting a money problem

If a figure looks wrong - a selling price below cloth cost, a VAT line on a Dubai
invoice, a balance that does not tie - state the arithmetic and stop. Changing a
price, a rate or a rounding rule is the owner's decision, never the agent's.
