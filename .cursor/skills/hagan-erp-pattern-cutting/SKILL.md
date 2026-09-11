---
name: hagan-erp-pattern-cutting
description: Pattern measurements, units and the heal migrations, base-to-client inheritance, DXF and TUD parsing, marker nesting and what the cutter receives. The unit rules are the highest-stakes detail in the repo - 76 read as inches instead of centimetres ruins cloth. Use before editing src/lib/pattern-library or src/lib/pattern.
---

# Patterns, measurements and cutting

Everything downstream of here gets cut with scissors. A wrong number does not
produce an error, it produces a ruined length of Italian cloth that cannot be
uncut. Slow down in this subsystem.

## Units are the whole game

Measurements are stored in exactly two units:

```ts
export type MeasurementUnit = "in" | "cm";
```

Default is `"in"`, both for new client patterns and for display. Inches are
stored as decimals and snap to **1/16**; centimetres round to 2 decimals:

```ts
if (fromUnit === "cm" && toUnit === "in") {
  return Math.round((value / 2.54) * 16) / 16;
}
return Math.round(value * 2.54 * 100) / 100;
```

`measurement-unit-preference.ts` is display only - localStorage and a `?unit=`
query param. It never changes a stored value. Do not let a display preference
leak into a write.

A body length of 76 is 76 cm or 76 inches depending on one string field. That is
the single most destructive mistake available in this codebase.

## The heal functions are data repair, and a GET can trigger them

Two migrations repair historical damage to the stored pattern document:

- `heal-measurement-unit.ts` fixes a mislabeled `unit`. Its header documents
  three real incidents: inch numbers labelled cm, an accidental cm conversion,
  and auto-consolidate stamping `"in"` while Pattern typed centimetres. Two of
  its three paths **relabel without touching the numbers**; only
  `applyConvertedCmBackToInches` rewrites values.
- `heal-empty-measurements.ts` copies a sheet from a sibling pattern, but
  **only when the target sheet is completely empty**. It never overwrites a
  filled cell.

The safety net against flipping a genuinely metric sheet is
`looksLikeStoredCmMagnitude`: two or more values at or above 60, or a max at or
above 70 with two values at or above 50. If you change measurement storage,
re-check that heuristic - it is what stands between a correct sheet and a
silently rewritten one.

Both heals are idempotent and return null when preconditions fail.

**Both run inside `after()` on the client-pattern GET route**, and again after
fabric-line assignment. So reading a pattern can mutate stored data. That is
surprising and it is real. When a user reports a sheet that changed on its own,
this is the first place to look.

## Inheritance is a snapshot, not a link

A base pattern is the house size grid. A client pattern is one person's sheet.
When a client pattern is created from a base, values are **copied once**.
Changing `base_size` later fills only empty cells. There is no propagation path
from an updated base back to existing client patterns - verified.

So "I fixed the base" never repairs sheets already cut from it. Say that out
loud when a user expects otherwise, and point at `load-from-base.ts` as the
explicit re-fill action.

"Siblings" in `copy-measurements-to-siblings.ts` means other patterns for the
same client and garment, or ones sharing a piece - not base-pattern siblings.
`copyWouldLoseFilledValues` blocks a copy that would blank filled cells.

## DXF and TUD

**DXF** is an ASCII TUKA / ANSI-AAMA export. The parser extracts piece names,
quantities, sizes and closed polyline outlines, and normalises everything to
centimetres. The input unit is read from TEXT entities and **defaults to
millimetres**:

```ts
const units = unitsFromTexts(allTexts) ?? "mm";
const toCm = units === "cm" ? 1 : units === "in" ? 2.54 : 0.1; // mm default
```

Get that default or that scale wrong and every outline is off by 10x or 25x.
Binary DXF and splines are not decoded. A file with no usable polylines returns
`null` rather than an empty pattern.

**TUD** is TUKA CAD's own format. Only the ASCII header between `@ Begin` and
`@ End` is parsed - style caption, sizes, pieces, areas in square metres,
perimeters in centimetres. The embedded thumbnail is extracted; the binary
geometry is **not** decoded. Unknown record types are skipped deliberately.

Both parsers return `null` on malformed input. Preserve that - a null is a
visible failure, a half-parsed pattern is an invisible one.

## Nesting does not order fabric

A marker is the layout of cut pieces along the fabric. Placement coordinates are
in centimetres, x along the length and y across the usable width, halved when
double-fold.

The nest estimate applies a 10% waste allowance:

```ts
export const NEST_ESTIMATE_WASTE_FACTOR = 0.1;
```

**That factor never leaves the nesting module** - verified, it appears only in
`nest-estimate.ts` and its own test. Ordered meters on the cutter sheet come
from the sales order fabric line quantity, and `cut-nest-preview.ts` only
compares the packed length against it to show `fits_on_order`. Nesting is
advisory. It does not write back to the order and it does not decide what gets
purchased.

When the estimate comes from TUD rather than DXF, the pieces are approximated as
rectangles from area and perimeter, and the UI says so: *"Approximate from TUD
areas - verify in TUKAmark before cutting."* Keep that disclaimer.

## What the cutter gets

One A4 per fabric article, carrying the nest preview, the TUD parts table, every
piece QR for that article, and the ordered meters. The cutter cuts the full nest
once, so **do not split an Overshirt and Trouser across pages** - that rule is
written into `expand-cutter-print-pages.ts`. Stitcher pages do split by piece;
cutter pages do not.

What blocks a cut: a `.TUD` per required piece, a positive
`marker_fabric_width_cm`, and `marker_double_fold` explicitly set. DXF and
`.tum` marker files are optional. Note the gate in `cutting-file-gate.ts` only
enforces TUD for stage advance, while the sheet UI also lists width and fold -
the two scopes differ, so check which one a user is actually blocked by.

## Concurrency

`protectPatternLibraryWrite` refuses to let a whole-document write replace
filled measurements with empty ones:

```ts
if (remoteFilled > 0 && incomingFilled === 0) {
  return { ...incoming, measurements: remote.measurements,
```

Same scar tissue as the sewing guards. Leave it alone.

## Tests

Seven are wired: `test:dxf-parser`, `test:tud-parser`, `test:tud-size-fill`,
`test:load-from-base`, `test:copy-measurements`, `test:base-pattern-picker`,
`test:client-fit-columns`. Forty-one are not. The ones that matter most before
touching measurements or nesting:

```
node --experimental-strip-types --experimental-loader ./scripts/tsconfig-paths-loader.mjs --test src/lib/pattern-library/heal-measurement-unit.test.ts
node --experimental-strip-types --experimental-loader ./scripts/tsconfig-paths-loader.mjs --test src/lib/pattern-library/heal-empty-measurements.test.ts
node --experimental-strip-types --experimental-loader ./scripts/tsconfig-paths-loader.mjs --test src/lib/pattern-library/measurements.test.ts
node --experimental-strip-types --experimental-loader ./scripts/tsconfig-paths-loader.mjs --test src/lib/pattern-library/nest-estimate.test.ts
node --experimental-strip-types --experimental-loader ./scripts/tsconfig-paths-loader.mjs --test src/lib/pattern-library/protect-pattern-library-write.test.ts
```
