---
name: verify-before-recommending
description: What must be proven before telling Ralph to press a button, run an action, or trust a fix. Use before adding any UI control, before writing a button label or confirm dialog, and before reporting that something is fixed.
---

# Verify before recommending

## Never infer behaviour from a name

An endpoint called `sync-lines` appended lines and preserved stored prices. A
button was wired to it and called "Rebuild lines from sales orders". It could not
rebuild anything. The doc comment on that function said so in its first line, and
it was not read.

Before wiring any UI control to an existing function or route:

1. Open the implementation. Read it, including the doc comment.
2. Check what it PRESERVES, not only what it changes. Look for spreads like
   `{ ...builtLine, ...existing }` and explicit `unit_price: existing.unit_price`.
3. Check how it matches records. Matching by `article_number` breaks across
   several sales orders because article numbers restart at 1 per order.
4. Confirm it handles the multi-order case, not only the single-order case.

## The label must describe the code, not the intention

A button label and its confirm dialog are a promise about behaviour. If the code
keeps typed prices, the dialog must not say prices "will be replaced". Write the
wording last, after reading the implementation, and make it describe what the
function actually does.

## Prove it before telling Ralph to press it

Do not recommend an action that has never been executed. At minimum write a test
that asserts the outcome being claimed. When the change is a repair, also assert
the OLD broken behaviour in a separate test, so nobody can silently revert to it.

## Say what was run and what was not

Production Supabase is not reachable from the agent VM. When a fix is proven only
against fixtures or the local `src/data` snapshot, say exactly that and say it in
the same breath as the claim - not buried at the end. Never let "it works" stand
for "the tests pass".

## When a mistake surfaces

State it plainly, name the file and line that caused it, fix it, and add the test
that would have caught it. Do not explain around it and do not re-litigate it
afterwards.
