# Client profile invariant

**Client profiles cannot be dropped while sales orders still reference them.**

Sales orders denormalize `client_id`, `client_code`, and `client_name`. Fabric Receiving and other production views can therefore still show activity (e.g. FR-0626-0037 / Pr Khaled Bin Salman) even if the row disappeared from the Clients list. That divergence must never recur.

## Guarantees

1. **Single write gate** — `writeClients()` in `src/lib/data/clients.ts` always runs `prepareClientsForPersist()` (retain linked + heal orphans from order fields) before persisting. UI bulk PUT, API v1 create, and any other caller of `writeClients` share this path.
2. **Delete guard** — `deleteClientById()` refuses deletion when a fresh sales-orders read still has that `client_id` (HTTP 409).
3. **Auto-heal on read (all roles, all read paths)** — Clients GET (+ API v1), Fabric Receiving overview + receipts, Sales Orders GET, the Print orders page, and the order print sheet all call `healClientDataForRead()` (`src/lib/clients/heal-on-read.ts`). It restores missing profiles append-only from denormalized SO fields **and** fills blank denormalized `client_name` / `client_code` on orders from the clients store (repair-only, never overwrites populated values), so a client with orders always resolves to a name regardless of role.
3b. **Warm-cache convergence** — Supabase-backed documents in the in-process cache refresh after 30s (`SUPABASE_CACHE_TTL_MS` in `document-persistence.ts`), so two serverless instances cannot serve different clients/orders snapshots indefinitely. A failed refresh keeps serving the previous snapshot (never downgrades to bundled JSON).
4. **Unassigned bucket** — Fabric Receiving keeps missing/blank client codes visible under “Unassigned client” instead of hiding them.
5. **Sync / import** — `scripts/sync-documents-from-supabase.mjs` and ClickUp `applyClickUpImport` retain/heal the same way and never pure-overwrite `clients.json` with a partial list.
6. **Manual repair** — `node scripts/reconcile-orphan-clients.mjs` (optional `--dry-run`).

## Do not

- Call `saveDocument` / raw filesystem writes for `clients.json` without going through retain + heal against current sales orders.
- Soft-delete or bulk-replace the clients list in a way that omits ids still present on open sales orders.
- Trust a Clients list editor payload as authoritative for “who may be removed.”

Regression tests: `src/lib/clients/orphan-reconciliation.test.ts` (especially `prepareClientsForPersist*`).
