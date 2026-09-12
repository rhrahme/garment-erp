# Working on this ERP

Read this first, then the two things it points at. Both already exist and are
kept current; nothing here repeats them.

## Where the knowledge lives

- **`docs/KNOWLEDGE.md`** - durable product decisions and invariants. What stays
  true. Read before changing behaviour, and update it when a decision is made or
  reversed.
- **`.cursor/skills/`** - eleven skills covering accounting, architecture,
  change safety, the domain, evidence, fabric quantities, the factory floor,
  pattern cutting, printing, side effects, and invoice line merging. Each one
  exists because something was got wrong once. Read the one that matches the
  task before starting it, not after.
- **`docs/session-*.md`** - what happened on a given day, including the
  reasoning behind a change and the mistakes made on the way to it. Useful when
  a decision looks arbitrary.

## Two rules worth stating here

**You cannot see production.** `src/data/*.json` is a committed snapshot that is
routinely days behind, and it is not what the owner sees on screen. It is good
enough to prove a rule about grouping or arithmetic. It is not evidence about
live data. Never quote a count, a price or a client's orders from it as fact.
`.cursor/skills/hagan-erp-evidence` has the full rule.

**Prices and specifications are not yours to invent.** A fabric specification
that cannot be traced to an uploaded price list prints blank, never a guessed or
inherited value. What a client is charged is the owner's decision: report a
disagreement, do not correct it.

## Checking your work

There is no single test script. Run the suite with:

```bash
node --experimental-strip-types --experimental-loader ./scripts/tsconfig-paths-loader.mjs \
  --test $(find src -name "*.test.ts" | sort | tr '\n' ' ')
```

Six failures are pre-existing; confirm against a clean tree before blaming your
own change. `next.config.ts` sets `typescript.ignoreBuildErrors`, so a type
error will not fail the build - it will crash at runtime instead. Run
`npx tsc --noEmit` and compare against the baseline rather than trusting a green
build.

The read-only audits under `scripts/audit-*.ts` report on real data without
writing to it, and are the fastest way to check whether a change helped.
