---
name: hagan-erp-architecture
description: How the HAGAN ERP is actually built - where data really lives, the Supabase document layer and its caches, sessions and roles, who is allowed to see money, and the API route conventions. Use before reading or writing any ERP data, adding an API route, touching auth, or quoting any figure from the repo.
---

# HAGAN ERP architecture

Next.js 15 App Router. Data is JSON-shaped documents in Supabase. Read this
before you touch data, because the single most damaging mistake in this repo is
assuming the JSON files in `src/data` are the live system.

## The files in src/data are NOT production

`src/data/*.json` is a **cold-start fallback**, committed to the repo and often
days behind. Production reads from the Supabase table `erp_documents`.

```ts
// src/lib/data/document-persistence.ts
export function isSupabaseDocumentsStorage(): boolean {
  if (process.env.ERP_USE_JSON === "true") return false;
  return isSupabaseConfigured() && isSupabaseAdminConfigured();
}
```

| Environment | Reads from | Writes to |
| --- | --- | --- |
| Production (Vercel) | Supabase `erp_documents`, cached 30s in process | Supabase; local disk not written |
| Local dev with Supabase | Same as production | Supabase plus a local JSON mirror |
| `ERP_USE_JSON=true` or no Supabase | Local JSON | Local JSON |

**A cloud agent cannot reach production Supabase.** It has the anon key at most,
and RLS blocks it. So:

- Any count, price, client or order you read from `src/data` describes a stale
  snapshot, not what the user sees on screen.
- Never state such a number as fact. Say which snapshot it came from and that
  production may differ. See the `hagan-erp-evidence` skill.
- Fixtures built from `src/data` are fine for tests. They are not evidence about
  live records.

### The exception: supplier price lists are production truth

`src/data/suppliers/*.json` does **not** go through `erp_documents`.
`src/lib/data/supplier-catalog-data.ts` imports each catalog as a static JSON
import, so they are compiled into the deployed bundle. What you read in the repo
is exactly what production serves.

That means composition, weight, width and list price for a catalogued fabric can
be quoted with confidence. A fabric line on a sales order cannot - that comes
from `erp_documents` and is as stale as everything else.

Know which of the two you are reading before you answer a question about fabric.

## Loading documents

The registry of all 44 document keys is `src/lib/data/document-keys.ts`
(`ERP_DOCUMENT_SPECS`). A human-readable catalog is in
`src/lib/data/erp-document-catalog.ts`.

- `ensureErpBootstrap()` loads the 7 core keys once per serverless instance:
  `clients`, `sales_orders`, `fabric_receipts`, `production_work_orders`,
  `supplier_contacts`, `costing_rates`, `exchange_rate_state`.
- `ensureDocumentsLoaded([...])` lazily loads specific keys. Every page or API
  route that reads a non-core document must call it first. A typical invoicing
  call is
  `ensureDocumentsLoaded(["customer_invoices", "sales_orders", "costing_rates", "clients"])`.
- `npm run audit:document-loads` enforces this statically and runs as part of
  `npm run build`. If the build fails there, you read a document without warming
  it.

### Read tiers

| Function | Behaviour |
| --- | --- |
| `readJsonFile` | Sync, cache only. Empty fallback if the cache is cold. |
| `readJsonFileAsync` | Awaits bootstrap, then reads. |
| `readJsonFileFreshAsync(path, fallback, { force })` | Re-fetches from Supabase. Refuses to downgrade to bundled JSON on failure. |
| `saveDocument` / `writeJsonFileAsync` | Preferred writes: Supabase upsert, cache update, local mirror in dev. |

**Use the `*Fresh` variant before any write**, and in any handler that must see
another instance's changes. `readSalesOrdersFresh()` invalidates the cache and
forces a Supabase read. Writing from a stale read silently clobbers concurrent
changes.

Cache TTL is 30 seconds. `invalidateDocumentCache(path)` clears one document;
with no argument it clears everything including the bootstrap promise.

## Sessions, roles, and money

`getSessionContext()` in `src/lib/auth/session.ts` resolves, in order: demo mode,
dev impersonation, then Supabase auth plus a `profiles.role` lookup. Gates are
`requireAuthenticated`, `requireAdmin`, `requireSuperAdmin`,
`requirePatternAccess`.

Roles are mutually exclusive and resolved by priority in
`src/lib/auth/permissions.ts`: super_admin, admin, client_manager, task_operator,
stitch_operator, production_operator, inventory_clerk, pattern_operator,
sales_operator, accounting. Each has an env email list with built-in fallbacks;
`SUPER_ADMIN_EMAILS` merges into the admin list.

**Only `isAdmin` sees money.** One gate covers prices, invoices, costing and
salaries:

```ts
// src/lib/auth/invoice-amounts-access.ts
export function canViewMoney(session: Pick<SessionContext, "isAdmin">): boolean {
  return Boolean(session.isAdmin);
}
```

Accounting and sales see the invoice and PO workflow with amounts redacted. Any
route returning an invoice must pass it through
`customerInvoiceForSession(session, invoice)`; supplier invoices use
`supplierInvoiceForSession`. Fabric list prices have a second gate,
`canViewPrices`, plus a per-page unlock cookie and access code.

Sales operators are scoped by `canAccessSalesOrder` in `src/lib/sales/access.ts`:
the order's `sales_owner_email` must match, and the client's brand must be in the
operator's `SALES_BRAND_SCOPE`. All other roles pass.

Badge logins (factory floor) live in `src/lib/auth/badge-login.ts`: scrypt
`salt:hash` credentials in the `badge_login_credentials` document, synthetic
Supabase emails like `badge-pattern-{id}@badge.hagan.pro` with the role encoded
in the local part, and a 5-attempt / 10-minute lockout.

## API routes

Two parallel trees, and business writes need both:

- `src/app/api/...` - the browser. Starts with `requireAuthenticated()`, applies
  role checks and `canAccessSalesOrder`, and redacts money on the way out.
- `src/app/api/v1/...` - integrations and Zapier. Starts with
  `verifyApiKey(request)`, skips session scoping, returns unredacted payloads.

83 route paths currently exist in both. When you add a business write endpoint,
mirror it under `v1` and call `notifyIntegration(event, data)` so ClickUp, Zapier
and the activity log see it. `notifyIntegration` is the hub in
`src/lib/integrations/index.ts`; event types are in
`src/lib/types/integrations.ts`.

`export const dynamic = "force-dynamic"` and
`export const fetchCache = "force-no-store"` are **not** universal boilerplate.
They appear on invoice, mutation and scan routes that must never serve stale
data. Do not add them reflexively; do add them when a route reads live ERP state.

## Server and client boundary

The repo does not use the `server-only` package, so nothing stops you at compile
time. The rules are by convention:

- `document-persistence.ts` uses `fs`. It and anything importing it must never
  reach a client bundle.
- Server Components load data and pass serialized props to
  `"use client"` children. There are around 190 client components.
- `src/lib/costing/cost-hint-worksheet.ts` is imported by a client component, so
  it imports `@/lib/costing/compute` as `import type` only. Keep it that way: if
  you need catalog or rates data there, resolve it in the caller
  (`load-cost-hint-worksheet.ts`) and pass it in.
- Do not import `src/lib/invoicing/build-invoice.ts` from a client component.

## Build and typecheck

- `npm run build` runs `audit:document-loads` then `next build`.
- `npm run lint` exits clean with warnings only.
- **`npx tsc --noEmit` reports roughly 262 pre-existing errors** and is not a
  green gate. Most are test files importing with `.ts` extensions and regex flags
  needing a newer target. Filter its output to the files you touched; do not try
  to fix the whole list.
