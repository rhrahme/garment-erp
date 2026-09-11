---
name: ship-to-production
description: How to ship a change to production in this ERP and record it. Use whenever asked to ship, deploy, push live, or save the session notes.
---

# Ship to production

Run in this order. Do not skip a step and do not report "shipped" before the last
one passes.

1. `npm test` and `npm run build` must both pass.
2. Commit with a descriptive message. One commit per logical change.
3. `git push -u origin <branch>`
4. `git push origin <branch>:main`
5. Wait for BOTH Vercel projects to reach Ready: `garment-erp` and
   `garment-erp-kvsf`. Verify with
   `gh api repos/rhrahme/garment-erp/commits/<sha>/status`.
6. Append to `docs/session-<date>.md`:
   ``Ship: `<sha>`. Both Vercel Ready (`garment-erp`, `garment-erp-kvsf`).``

## Never commit

- Large `src/data/*.json` data dumps
- Generated PDFs
- Passwords, keys or secrets

## Other constraints

- ASCII only in any file Next compiles. No smart quotes, no em dashes, no accents.
- Reuse the existing `github.com/rhrahme/garment-erp:main` CI subscription. Do not
  create another one.
- Do not change the title or body of an older PR.
- Do not force push and do not amend commits.
