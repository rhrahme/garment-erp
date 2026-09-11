---
name: hagan-erp-evidence
description: What must be true before stating a fact, quoting a number, recommending an action, or calling something fixed in this ERP. Use before every claim about live data, before wiring any UI control, and before reporting that work is done.
---

# Evidence before claims

Ralph runs this factory on these numbers. A confident wrong answer costs him more
than a slow one. Every rule here exists because it was broken and cost him hours.

## You cannot see production

A cloud agent has no reachable path to production Supabase. `src/data/*.json` is
a committed snapshot that is routinely days behind, and it is NOT what the user
sees on screen.

**Never state a live figure read from the repo.** Not a count, not a price, not a
client's orders, not "he has 3 T-shirts".

What happened: the repo snapshot said 3 T-shirts. The live sheet said 7. The
snapshot was four days old. The caveat was mentioned and then the number was
quoted as fact anyway, which is the same as not mentioning it.

Do this instead:

1. If the user can see it, ask them, or ask for the screenshot. That is faster
   and correct.
2. If you must compute from the snapshot, lead with the limit in the same
   sentence as the number: "in the repo's Sep 7 snapshot, 3 - production may
   differ."
3. Prefer explaining the mechanism over quoting the value. "The summary counts
   garments and expands combo sets" is always true. "It says 340 pcs" may not be.

A snapshot is fine for building test fixtures and for reasoning about structure.
It is not evidence about a live record.

## Never infer behaviour from a name

An endpoint called `sync-lines` appended rows and preserved stored prices. A
button was wired to it, labelled "Rebuild lines from sales orders", and
recommended to the user. Its doc comment said "Append... Preserves entered unit
prices" in the first line and was never read.

Before wiring any control to an existing function or route:

1. Open the implementation and read it, including the doc comment.
2. Check what it **preserves**, not only what it changes. Look for
   `{ ...built, ...existing }` and explicit `unit_price: existing.unit_price`.
3. Check how it **matches** records. Matching by `article_number` works on one
   order and silently drops lines across several, because article numbers restart
   at 1 per order.
4. Confirm it handles the multi-order case, not only the single-order case.

## The label must describe the code

A button label and its confirm dialog are a promise about behaviour. Write them
last, after reading the implementation. If the function keeps typed prices, the
dialog must not say prices "will be replaced".

## Prove it before telling Ralph to press it

Do not recommend an action that has never been executed.

- Write a test that asserts the outcome you are claiming.
- When the change is a repair, also assert the **old broken behaviour** in its
  own test, so a silent revert turns the suite red. Example:
  `rebuild-invoice-lines.test.ts` contains "differs from sync, which preserves
  the stale price".
- For a data-shaped fix, run it over the real snapshot and report counts: "182 of
  182 priced lines reconcile", not "should be correct now".

## Run the tests that exist

There is no aggregate `npm test`. Around 139 `*.test.ts` files are wired to no
npm script and are never run. Assume a test file adjacent to the code you are
changing exists and is stale.

```bash
node --experimental-strip-types --experimental-loader ./scripts/tsconfig-paths-loader.mjs --test path/to/file.test.ts
```

Aggregator scripts such as `scripts/test-consolidate-lines.mjs` use `register()`
plus `--experimental-strip-types` and import test files directly. When you add a
test, wire it into one of those scripts or it will never run again.

A PDF test sat unwired and failing on `main` for weeks: the Swatch column was
30pt, too narrow for its own 7.5pt bold header, so jsPDF split it into "Swatc"
and "h". Nobody saw it because nothing ran it.

## Separate what was run from what was reasoned

Say which it is, in the same breath as the claim. "The tests pass" is not "it
works in production". "I read the code" is not "I ran it".

## When you are wrong

State it plainly, name the file or the reason, correct it, and move on. Do not
explain around it, do not relitigate it, and do not repeat numbers derived from
the same bad source without re-checking them.
