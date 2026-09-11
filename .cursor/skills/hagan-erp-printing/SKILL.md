---
name: hagan-erp-printing
description: How the ERP produces PDFs, thermal labels and browser print sheets, and how to verify a layout change when you cannot see the page. Covers the 14 generators, label geometry, the D550 rotation trap, and the column-width failure that ships silently. Use before touching any generate-*-pdf file, print CSS or sticker code.
---

# PDFs, labels and print sheets

You cannot see the output. That is the whole problem. A layout change that
compiles, passes tests and reads correctly can still produce a wrong piece of
paper, and the first person to find out is holding it.

## The three audiences

Know which one you are editing before you change anything.

**Goes to a client** - `src/lib/invoicing/generate-pdf.ts` (invoice and quote),
`generate-riyadh-bank-details-pdf.ts`. Errors here are seen by customers.
Nothing internal may leak onto these: no cost hint, no fabric cost, no margin.

**Internal staff** - cost hint worksheet, sales order PDF, pattern sheets, base
size sheets, the Loro Piana swatch audits, label maps, workstation cards and
QR placards, attendance wall. The cost hint file carries the comment
`Never send this PDF to a client.` Believe it.

**Physically printed and stuck on something** -
`src/lib/production/generate-sticker-pdf.ts` (garment stickers),
`src/lib/hr/generate-employee-badge-pdf.ts` (CR80 badges), carton stickers.
Highest risk: wrong output means a roll of ruined labels or a garment with
someone else's identity on it.

## There is no shared layout library

`src/lib/pdf/` contains only `download-filename.ts`. No shared header, footer,
branding, margin or font helper. Every generator defines its own page setup, so
a fix in one does not propagate. Units are not consistent either:

- **pt** - invoices, cost hint, sales orders, Loro Piana audits
- **mm** - pattern sheets, badges, stickers, factory PDFs

Check the `new jsPDF({ unit: ... })` call before you write a single coordinate.

## The column width failure, and how to catch it

A column narrower than its own header silently wraps. `Swatch` in a 30pt column
at bold 7.5pt became `Swatc` + `h` on a printed worksheet, and no test caught
it because the text was still in the PDF byte stream. It is now 34pt.

autoTable never checks that a column fits. Nothing in this repo does. Before you
change a `cellWidth`, a `fontSize` or a header string, measure:

```js
import { jsPDF } from "jspdf";
const doc = new jsPDF({ unit: "pt", format: "a4" });
doc.setFont("helvetica", "bold");
doc.setFontSize(headFontSize);
const budget = cellWidth - cellPadding * 2;
// doc.getTextWidth(header) must be <= budget
```

Measured state of the audit PDFs in
`generate-loro-piana-books-needing-swatches-pdf.ts` - every header fits, but
`renderPartialTable` (head at line 450, bold 8pt, padding 3) is on the edge:

| Header | Text | Budget | Slack |
| --- | --- | --- | --- |
| `Missing` | 29.7pt | 29.8pt | **0.1pt** |
| `Catalog` | 29.2pt | 29.8pt | 0.6pt |
| `Book #` | 26.6pt | 29.8pt | 3.2pt |

Renaming `Missing` to anything longer, or nudging that 0.07 fraction down,
breaks the header. Treat those three columns as locked.

## Images: some fail loudly, some fail blank

| Asset | Format | On failure |
| --- | --- | --- |
| Fabric swatches | JPEG data URL, sharp 80x80 q85 | `null` -> **blank cell, no error** |
| QR on sales order PDF | PNG fetched, converted to JPEG | missing -> **blank cell** |
| QR on stickers, badges, attendance | fetched | **throws** |

The blank-cell paths are the dangerous ones: the PDF generates fine and the
information is simply absent. If a user says a swatch is missing, that is a
data or fetch problem, not a layout problem.

**Never embed an indexed 1-bit PNG.** jsPDF renders it blank in most viewers and
on the D550. QR codes are converted to JPEG for exactly this reason.

## Label geometry is not negotiable

Defined in `src/lib/production/label-print-config.ts`:

- roll 50 x 100 mm, raster 203 DPI (8 dots/mm)
- printer-match page 51 x 102 mm
- sticker QR 27 mm square
- sticker fonts are in **mm cap height**, not pt

Badges are CR80: 85.6 x 54 mm, 2 x 5 per A4 (`src/lib/hr/badge-print.ts`).
Carton stickers are 4 x 6 in, margin 0.

**The D550 rotation trap.** Default `printer-match` mode pre-rotates content 90
degrees counter-clockwise into a 102 x 51 landscape page, because the driver
then rotates 90 clockwise onto 51 x 102 portrait media. The two rotations cancel
and the label comes out upright. Change one side without the other and every
label prints sideways or clipped. Sticker text is also rasterised to JPEG rather
than drawn as vector text, because D550 drivers do not reliably print `Tj`.

Sticker text uses Roboto embedded as base64 in
`src/lib/production/fonts/roboto-regular-base64.ts` and converted to glyph
outlines, because production Linux has no Helvetica and every glyph rendered as
a tofu box. That is a fixed bug. Do not "simplify" it back to `<text>`.

## Browser print sheets are a separate system

Nine print-CSS modules, each with its own `@page`. A4 portrait 12mm is the house
default (sales order receiving sheets, invoices, pattern how-to, custom fabric);
cost hint is A4 landscape 10mm; badges A4 portrait 8mm; carton stickers 4x6in;
stickers 102x51mm.

These are guarded by regex tests on the CSS string, not by rendering.
`receiving-print-styles.test.ts` asserts A4 portrait, exactly 12mm margins, no
`transform: scale` or `zoom`, table font at least 10pt, and that the page lives
under the `(print)` layout rather than the dashboard shell. Those assertions
encode real complaints. Run `npm run test:a4-print-styles` after touching them.

## Verifying without eyes

In rough order of strength:

1. Run the wired test if one exists - `npm run test:consolidate-lines` covers
   the cost hint PDF, `test:a4-print-styles`, `test:inventory` (carton),
   `test:badge-print`.
2. Measure header and value widths with `getTextWidth` as above.
3. For stickers, `node scripts/pdf-proof.mjs` then
   `node scripts/pdf-geometry-verify.mjs` - these decode the QR with jsQR and
   check the MediaBox is about 51 x 102 mm.
4. `node scripts/extract-pdf-images.mjs` confirms embedded images exist and
   reports their dimensions.
5. `patternSheetPdfPageCount()` proves a sheet still fits one page.

What none of this catches is overlap, alignment and visual balance. There is no
visual diff and no headless render. When a change is cosmetic, say plainly that
you verified structure only and ask the user to look at the output.

## Unwired tests worth running

```
node --experimental-strip-types --experimental-loader ./scripts/tsconfig-paths-loader.mjs --test src/lib/production/sticker-print-html.test.ts
node --experimental-strip-types --experimental-loader ./scripts/tsconfig-paths-loader.mjs --test src/lib/pattern-library/generate-pattern-sheet-pdf.test.ts
node --experimental-strip-types --experimental-loader ./scripts/tsconfig-paths-loader.mjs --test src/lib/pattern/pattern-howto-print-styles.test.ts
node scripts/test-invoice-pdf-amounts.mjs
```

## Text gotchas

Amounts on PDFs go through `formatInvoiceSarForPdf`, which emits plain ASCII.
The screen formatter `formatInvoiceSar` uses a non-breaking space, and that
character must not reach a PDF - there is a test for it. Pattern measurements
use ASCII fractions, not Unicode ones. There is no Arabic or RTL support in any
PDF or sticker path.
