---
name: hagan-erp-guardrails
description: Standing rules for this HAGAN ERP repo covering costs, client documents, client identity and honesty about what was verified. Use on any task touching invoices, quotes, costing, pricing, PDFs or client records.
---

# HAGAN ERP guardrails

## Costs never reach the client

Cost hints, fabric cost and margin are INTERNAL. They belong on the cost hint
worksheet only. Never put them on a client quote, invoice or any PDF sent out.

## Never invent money

Do not invent mill prices. Do not invent Caccioppoli `35xxxx` prices. If a price
is missing, show it as missing so it gets entered. A guessed number in a costing
sheet is worse than a blank.

## Pricing is the owner's decision

If a selling price looks wrong - for instance below the cloth cost - report it
with the arithmetic and stop. Do not change a price, a markup or a pricing rule
without being told to.

## Client identity

"Pr Khaled" is Pr Khaled Bin Salman, client code `FR-0626-0037`. He is NOT Khaled
Al Moussa, `FR-0426-0007`. Free-text search matches both, so filter by client
code.

## Invoices

- Never combine an invoice that is paid or carries a payment.
- A single draft may take on sales orders that have no invoice yet - that is not
  a "select at least two" case.

## Imports

Do not import `src/lib/invoicing/build-invoice.ts` from a client component. Use a
client-safe module for grouping in the UI.

## Honesty

- This agent runs on a remote VM. It cannot write files to Ralph's Mac. Never
  imply otherwise.
- Do not report a fix as verified unless it was actually run. If something was
  only reasoned about, say so.
- When a mistake is found, state it plainly and fix it. Do not bury it.
