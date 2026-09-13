# Garment Factory ERP — Current State Audit

**Date:** 12 September 2026
**Commit audited:** `917b13cd19c883418d7b8af3dd2a263b6b39661a` (clean working tree)
**Method:** Read-only inspection of the source. No code was changed. No production data was created, modified, or deleted.

---

## About this report

This is an evidence-based audit written for a technical reviewer who has not seen the codebase. Every status claim below is tied to a file path, and in most cases to a quoted line. Where I could only infer something, or could not check it at all without access to the live deployment, I say so explicitly rather than guessing.

### Coverage: what was and was not inspected

The project is large — **1,400 TypeScript/TSX files, roughly 193,000 lines**, 78 pages and 324 API route files. It was not possible to read every file. Coverage was as follows:

**Read in full or near-full:**
- All type definitions in `src/lib/types/` (the data model)
- The persistence layer: `src/lib/data/document-persistence.ts`, `document-keys.ts`, `inventory-store.ts`
- Authentication and permissions: `src/lib/auth/`, `src/lib/supabase/middleware.ts`
- The production and scanning core: `src/lib/production/stage-scan.ts`, `execute-stage-scan.ts`, `sticker-scan.ts`, `sewing-session.ts`
- Label identity: `src/lib/sales-orders/label-codes.ts`
- All 19 SQL migrations in `supabase/migrations/`
- Build and deploy config: `next.config.ts`, `vercel.json`, `package.json`

**Sampled systematically (not exhaustively):**
- API route handlers — roughly 20 of 324 were opened individually; the rest were surveyed by pattern-matching for authorization guards. The per-route authorization table in §7 is a **sample, not a census**.
- React components — surveyed for data sources and stub markers rather than read line by line.
- The 166 test files — the suite was executed and failures identified, but individual test bodies were largely not reviewed.

**Not inspected:**
- The live deployed environment. No credentials were available, so nothing in this report confirms runtime behaviour in production.
- The contents of the production Supabase database, including which migrations are actually applied and what the real role distribution is.
- `scripts/` (about 100 one-off maintenance and import scripts) beyond spot checks.
- The bundled supplier catalogue JSON files in `src/data/suppliers/` (several MB of price-list data).
- Any of the historical ClickUp import cache under `src/data/.clickup-cache-build/`.

I have deliberately avoided reporting anything about specific customers, and no secret values appear anywhere in this document — only environment variable *names*.

---

## 1. System overview

### What it does

This is a bespoke (made-to-measure) menswear factory ERP. That framing matters more than anything else in this report, because it explains most of the design decisions and most of the gaps: **the system is built around one garment at a time, not batches.** There is no "quantity" field on a production record anywhere in the factory floor model. A customer ordering ten suits produces ten separate order lines, each with its own cloth, its own label codes, and its own work orders.

It covers a genuinely wide span of the business: taking client orders, sourcing and purchasing cloth from Italian mills, receiving and preparing that cloth, drafting and storing patterns, tracking garments through the factory by QR scan, quality control, invoicing and costing, payroll administration, and a substantial amount of supplier email automation.

### Who uses it

Sixteen roles are defined in `src/lib/types/database.ts`. Around eleven are actually wired into access control (see §7). In practice the distinct user groups are: administrators and super-admins, sales staff, accounting, a QC/client manager, pattern makers, production floor operators, stitching operators (tailors at a kiosk), inventory clerks, and a fabric-receiving task operator.

### Technology

| Layer | Choice | Evidence |
|---|---|---|
| Framework | Next.js 15.3 App Router, React 19 | `package.json` |
| Language | TypeScript 5.8 | `package.json`, `tsconfig.json` |
| Styling | Tailwind CSS 4 | `postcss.config.mjs` |
| Auth | Supabase Auth (GoTrue), HTTP-only cookies via `@supabase/ssr` | `src/lib/supabase/middleware.ts` |
| Database | Supabase Postgres — but see the important caveat below | `supabase/migrations/` |
| File storage | Supabase Storage, six private buckets | migrations 008–018 |
| PDF generation | jsPDF + jspdf-autotable, server-side | `src/lib/pdf/`, `src/lib/costing/` |
| Images | sharp (labels, PDFs), heic-convert (phone photos) | `next.config.ts` `serverExternalPackages` |
| Email | nodemailer (outbound SMTP), imapflow + mailparser (inbound) | `src/lib/email/` |
| Hosting | Vercel | `vercel.json`, `.vercelignore`, `VERCEL` env checks in code |

### The database, and why it needs a caveat

Calling this "a Postgres app" would be misleading. There are two parallel persistence models, and the one that matters is not the relational one.

**The live model is a document store.** Migration `006_erp_documents.sql` creates a single table:

```sql
create table if not exists erp_documents (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
```

Every significant entity in the running system — clients, sales orders, production work orders, the pattern library, inventory, payroll — lives as one large JSONB blob in one row of this table. There are roughly 45 such document keys, listed in `src/lib/data/document-keys.ts`. `sales_orders` is a single row holding every order ever taken (1.6 MB on disk); `pattern_library` is a single row of 5.1 MB.

**The relational model is largely vestigial.** Migration `001_initial_schema.sql` defines a proper normalised schema — `styles`, `skus`, `boms`, `work_orders`, `washing_batches`, `piece_rates` and more, with foreign keys, unique constraints, check constraints and row-level security policies. It is well designed. It is also mostly unused by the bespoke workflow the factory actually runs. `src/lib/data/queries.ts` reads from these tables, but only the Dashboard, Washing and parts of Quality still depend on them. The two models disagree on fundamentals: the relational `so_status` enum is `draft | confirmed | in_production | ...`, while the live `SalesOrderStatus` in `src/lib/types/sales-orders.ts` is `open | fabric_pos_created | complete | superseded`.

The switch between storage backends is here:

```61:64:src/lib/data/document-persistence.ts
export function isSupabaseDocumentsStorage(): boolean {
  if (process.env.ERP_USE_JSON === "true") return false;
  return isSupabaseConfigured() && isSupabaseAdminConfigured();
}
```

Committed JSON files under `src/data/` mirror these documents. On Vercel they are read-only fallbacks — local writes are skipped entirely (`isLocalJsonWritable()` returns false when `VERCEL === "1"`).

### Authentication

Supabase Auth with cookie sessions. Two login paths: email/password at `/login`, and a badge login for floor staff where a badge number plus a staff-chosen password maps onto a synthetic Supabase account (`badge-{kind}-{employeeId}@badge.hagan.pro`, see `src/lib/auth/badge-login.ts`). A demo mode activates automatically when Supabase is not configured, and in that mode **any email address signs in with no verification** (`src/lib/auth/demo-mode.ts`).

### External services

Verified integrations, each with code behind it: SMTP for outbound mail, IMAP for scanning the supplier inbox, Zapier webhooks for event fan-out, 17TRACK for air waybill tracking, and direct API integrations with the cloth merchants Drapers and Caccioppoli. Loro Piana and Caccioppoli swatch imagery is synced to storage. ClickUp was used for a one-off historical order import. An exchange-rate feed drives EUR/SAR alert emails. **WhatsApp is not integrated** despite appearing in UI copy — the only reference is a "open in new tab to share" hint on a PDF button.

Environment variable names (values never read): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ERP_API_KEY`, `CRON_SECRET`, `SMTP_*`, `IMAP_*`, `ZAPIER_WEBHOOK_URL`, `CLICKUP_API_TOKEN`, `DRAPERS_API_KEY`, `CACCIOPPOLI_API_TOKEN`, plus a set of role email allowlists (`SUPER_ADMIN_EMAILS`, `ADMIN_EMAILS`, `PATTERN_EMAILS`, and so on).

### Project organisation

Conventional Next.js layout. `src/app/(dashboard)/` holds the 58 authenticated pages, `src/app/(print)/` holds 16 print-optimised layouts (A4 sheets, label rolls, badges), `src/app/api/` holds the 324 route handlers. Business logic lives in `src/lib/<domain>/` and is mostly well separated from the React components in `src/components/<domain>/` — this is why the codebase is testable at all.

### Deployment configuration — verified vs confirmed

**Verified from configuration:** The app is configured for Vercel. `vercel.json` declares four cron jobs (a daily Supabase auth health check, and three that drive the stitching kiosk's workday and lunch schedule) and raises the timeout to 300 seconds for the two inbox-scanning routes. `next.config.ts` traces supplier catalogue JSON into specific lambdas.

**Confirmed live:** Vercel preview deployments run against this repository and report status checks on commits — I confirmed this via the GitHub checks API on the audited commit. That tells us the Vercel integration is real and building. It does **not** tell us that a production deployment is serving the factory, nor which environment variables are set there. Several code comments refer to production behaviour on Vercel as a present-tense fact, which is suggestive but is not evidence I can verify from here.

**Two findings worth flagging immediately:**

```17:20:next.config.ts
const nextConfig: NextConfig = {
  // Legacy JSON/email modules have strict-check debt; runtime paths are covered in dev.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
```

TypeScript and ESLint errors do not block a build. There are currently **263 TypeScript errors** on a clean checkout. And there is **no `.github/` directory at all** — no continuous integration, so the 1,154-test suite never runs automatically. The only build-time gate is `npm run audit:document-loads`, a custom static check (`scripts/audit-document-loads.mjs`) that verifies API routes warm the document cache before reading it. That check is thoughtful and catches a real class of production bug, but it is not a substitute for tests or type checking.

---

## 2. Feature inventory

Status definitions used below:
- **End to end** — UI, API, persistence and validation all present and connected.
- **Partial** — works, but with a material piece missing or a dependency on a legacy path.
- **UI only / mock** — renders, but is not backed by a working write path.
- **Missing** — expected but absent.
- **Unverifiable** — needs the deployed environment or live data.

Throughout, "end to end" means *implemented and connected*. It does **not** mean *tested and working*. Test coverage is called out separately in the last column, and §8 covers what that coverage is worth.

### Core order-to-cash

| Module | Path | Purpose & data | Status | Evidence | Tests |
|---|---|---|---|---|---|
| Sales orders | `/orders/*` | Order lifecycle, fabric lines, label generation, PDFs. Writes `sales_orders`, `sales_order_drafts` | **End to end** | 12+ write routes under `src/app/api/sales-orders/`; `src/lib/sales-orders/` | 19 files |
| Sales workspace | `/sales` | Sales-team home: client detail, fittings, milestones, photos. Writes `sales_workspace` | **End to end** | `src/lib/sales/`; note the backing JSON file is absent locally and falls back to empty | 1 file |
| Clients | `/clients` | Client profiles, codes, brand scoping, name-change approval flow | **End to end** | `src/lib/clients/`; `src/app/api/clients/` | 7 files |
| Customer invoicing | `/invoices/*` | Build invoices from orders, consolidate lines, payments, VAT, PDF | **End to end** | `src/lib/invoicing/`; 6+ write routes | 13 files |
| Costing & cost hints | `/costing`, `/invoices/[id]/cost-hint/print` | Per-order cost breakdown; offline price-hint worksheets with suggested rates | **End to end** | `src/lib/costing/cost-hint-worksheet.ts` | 3 files |

### Fabric sourcing and inbound supply

| Module | Path | Purpose & data | Status | Evidence | Tests |
|---|---|---|---|---|---|
| Fabric specification | `/fabric-specification` | Browse mill catalogues, HS codes, stock; create one-off fabrics | **End to end** | `src/lib/fabric-sourcing/` | 10 files |
| Fabric orders (POs) | `/fabric-orders/*` | Raise and send purchase orders to mills; autosaved drafts | **End to end** | `src/lib/integrations/fabric-order-store.ts` | 4 files |
| Supplier emails | `/supplier-emails` | Queue, review and send grouped PO emails | **End to end** | `src/lib/fabric-sourcing/email*.ts` | 2 files |
| Supplier inbox | `/supplier-inbox` | IMAP scan of replies; match POs, AWBs, invoices, stock alerts | **End to end** | `src/lib/email/inbound/scan-inbox.ts` | 4 files |
| Supplier invoices | `/supplier-invoices` | Index mill and transporter PDFs pulled from the inbox | **End to end** | `src/lib/integrations/supplier-invoice-store.ts` | — |
| Shipments / AWB | `/shipments` | Inbound cloth shipment tracking via 17TRACK | **End to end** (inbound only) | `src/lib/integrations/shipment-store.ts` | 4 files |
| Purchasing hub | `/purchasing/*` | Legacy PO mirror, price-list import, supplier contacts | **Partial** | Overlaps `/fabric-orders`; `/purchasing/page.tsx` lines 22–49 render a **hardcoded sample email** regardless of live data | 4 files |

### Factory floor

| Module | Path | Purpose & data | Status | Evidence | Tests |
|---|---|---|---|---|---|
| Fabric receiving | `/fabric-receiving` | Receive cloth by scan; wash/soak/dry/iron prep; defect reports | **End to end** | `src/lib/production/fabric-receiving*.ts`; 7 write routes | in the 27 |
| Production floor | `/production`, `/production/workstation/[id]` | Stage tracking per garment piece by QR scan | **End to end** | `src/lib/production/stage-scan.ts` | 27 files |
| Stitch kiosk | `/stitch`, `/stitch/orders` | Tailor badge + garment QR opens/closes a timed sewing session | **End to end** | `src/lib/production/sewing-session.ts` | in the 27 |
| Floor map | `/production/floor-map` | Interactive factory layout with workstation QR pins | **End to end** | `src/lib/production/factory-workstations.ts` | — |
| Pattern queue | `/pattern/*` | Pattern jobs per order line, fittings, revisions, stage scans | **End to end** | `src/lib/pattern/` | 9 files |
| Pattern library | `/pattern/library/*` | Base size grids, client patterns, TUD/DXF CAD files, markers | **End to end** | `src/lib/pattern-library/` | 39 files |
| Inventory (trims) | `/inventory/*` | Buttons, thread, hangers; cartons, recipes, ledger, QR scan | **End to end** | `src/lib/data/inventory-store.ts` | 3 files |
| Thread & buttons | `/thread-buttons` | Match thread and buttons to each cloth line, with photos | **End to end** | `src/lib/production/thread-button-matching.ts` | — |
| Quality control | `/quality` | Log inspections with pass/rework/fail | **Partial** | Writes to `quality_inspections` JSON, but the work-order picker reads the **legacy relational shape**, and an inspection result never changes a production status | 1 file |
| **Washing (garment)** | `/washing` | Garment wash batch table | **UI only / mock** | See below | none |

The Washing page deserves its own note because it is the clearest example of a stub. `getWashingBatches()` in `src/lib/data/queries.ts` returns a hardcoded array of three fictional batches dated May 2024 when in demo mode, and otherwise queries the relational `washing_batches` table. I searched the entire repository: **`washing_batches` appears in exactly one file, and only as a read.** Nothing writes it. The "+ Schedule Batch" button in `src/app/(dashboard)/washing/page.tsx` line 14 has no click handler. This page cannot function.

This is less alarming than it sounds, because the *real* washing work is tracked elsewhere — see §3.

### Back office

| Module | Path | Purpose & data | Status | Evidence | Tests |
|---|---|---|---|---|---|
| HR / payroll | `/hr`, `/hr/overtime` | Salary register, WPS fields, overtime and deductions | **Partial** | `src/lib/hr/`; register is populated by an external Excel import script, not in-app | 6 files |
| ID badges | `/hr/id-badges/*` | Employee badge PDFs with scannable QR | **End to end** | `src/lib/hr/badge-print.ts` | in the 6 |
| Admin approvals | `/approvals` | Mobile page for approving name changes, kiosk corrections, line deletes | **End to end** | Token-authorised, no login required | 4 files |
| Documents library | `/documents` | Admin viewer over every ERP document and catalogue | **End to end** (read-only) | `src/lib/data/documents-library.ts` | — |
| Login log | `/logins` | Audit of sign-in attempts with IP and device | **End to end** | `src/lib/data/login-events.ts` | — |
| Team how-to notices | `/how-to`, `/pattern/how-to` | Operator instructions, emailed and acknowledged per team | **End to end** | `src/lib/pattern/pattern-operator-notice-*.ts` | 1 file |
| Public REST API v1 | `/api/v1/*` | API-key surface mirroring most ERP writes | **End to end** | 108 route files | via domain tests |
| Dashboard | `/dashboard` | Ops overview and alerts | **Partial** | Mixes live documents with **demo arrays** from `queries.ts` lines 45–91; low-stock reads the empty relational `inventory` table, not the live trim store | 1 file |
| Brands | `/brands` | Reference page for the four house brands | **Partial** | Static JSON; UI text says "Stock list coming soon" | — |
| Marketing lookbook | `/marketing` | Curated "Suits (Young)" print lookbook | **UI only / static** | Hardcoded array in `src/lib/marketing/suits-young.ts` | — |
| Label printer test | `/labels/test` | Calibrate the thermal label printer | **End to end** (tooling) | `src/lib/production/label-print-config.ts` | — |

### Against the intended capability list

| Intended | Status | Where it actually lives |
|---|---|---|
| Receiving fabrics | **End to end** | `FabricReceipt` records, scan station `receive` |
| Washing | **End to end, but not where you'd look** | Cloth washing is a real tracked prep stage on the receipt (`wash`/`soak`/`drying`). Garment washing is production stage `washing`. The `/washing` page is unrelated and non-functional |
| Patterns | **End to end** | A parallel track (`pattern_jobs` + `pattern_library`), not a production stage |
| Cutting | **Partial** | Tracked as a status, but the cutting scan records no cut length, piece count or waste — see §3 |
| Stitching | **End to end** | Two layers: production stage `sewing` plus timed kiosk sessions |
| Finishing | **End to end** | Production stage `finishing` |
| Ironing | **Partial / misleading** | Ironing exists only as *cloth* prep before cutting. There is **no post-stitch pressing stage** |
| Delivery | **Partial** | A driver handover (`handover_to`, `handed_to_driver_at`, a proof photo) marks a piece `completed`. There is no outbound shipment, delivery note, or partial-delivery record |
| Client trial images | **End to end for upload and linking** | `ClientPhoto` in the sales workspace, assignable to a cloth line and pattern. **No comment or approval workflow** |
| Tailors scan individual garments | **End to end** | This is the strongest part of the system — see §4 |

---

## 3. Actual production workflow

### How the entities relate

The spine of the system is short and, once understood, quite elegant:

**Client → Sales Order → Fabric Line → Label Stickers → Work Orders**

A **client** (`clients` document) has a code like `FR-0726-0038` carrying a brand prefix. A **sales order** belongs to one client. Each **fabric line** on that order is *one garment*: a cloth choice, a garment type, a length in metres. Critically, `SalesOrderFabricLine.quantity` is **metres of cloth, not a garment count** (`src/lib/types/sales-orders.ts` line 29).

When a line is created, the system generates one **label sticker per physical piece** of the garment:

```211:212:src/lib/sales-orders/fabric-lines.ts
  const label_stickers = generateFabricLabelStickers(clientReference, lineIndex, garment_type);
  const label_count = label_stickers.length;
```

A shirt gets one sticker; a two-piece suit gets two (Jacket, Trouser); a three-piece gets three. When the cloth is received and prepped, each sticker becomes one **production work order** — the unit that moves through the factory.

**Patterns** run alongside, not inside, this pipeline. A `PatternJob` is created per fabric line when an order is confirmed, and links optionally to a `ClientPattern` in the pattern library. **Styles, SKUs and BOMs exist in the relational schema but are not used** by this workflow — there are no styles in a bespoke house, only clients and their measurements.

### The stages

```3:12:src/lib/types/production.ts
export const PRODUCTION_STAGES = [
  "received",
  "fabric_prep",
  "cutting",
  "sewing",
  "washing",
  "finishing",
  "packed",
  "completed",
] as const;
```

Progression is strictly linear and one step at a time (`getNextProductionStage` in `src/lib/production/sticker-scan.ts`). Work orders enter at `cutting` — the first two values are handled by the fabric receiving subsystem instead, and are explicitly rejected on a work order:

```194:196:src/lib/production/sticker-scan.ts
  if (status === "received" || status === "fabric_prep") {
    throw new Error("Fabric receiving and prep are handled under Fabric Receiving.");
  }
```

Before that, the cloth passes through a separate state machine on the `FabricReceipt`: `pending → received → fabric_prep → handed_off`, with prep sub-steps `wash → drying → iron`, or `soak → iron`, or `iron_only`.

### What triggers each transition, and who can do it

| Transition | Trigger | Who |
|---|---|---|
| Order created → `open` | Sales enters the order | Sales, admin, QC |
| `open` → `fabric_pos_created` | POs raised against mills | Sales, admin |
| Cloth arrives → receipt `received` | Scan at station `receive` | Task operator, production, admin |
| Prep steps | Scan at `wash` / `soak` / `iron` | Same |
| Prep done → work orders created at `cutting` | Handoff to production | Same |
| `cutting` → `sewing` | Scan at station `sewing`, **or** closing a kiosk session | Production, stitch operator |
| `sewing` → `washing` → `finishing` → `packed` | Scan at the matching station | Production operators |
| `packed` → `completed` | Delivery form requires naming a driver | Production, admin |
| Any → order `complete` | Invoice marked sent or paid | Accounting, admin |

One subtlety worth understanding: **scanning at a station does not advance to that station — it advances *from* the previous one.** Scanning at `cutting` while the piece is at `cutting` is only a check-in:

```227:239:src/lib/production/stage-scan.ts
  if (station === "cutting") {
    if (workOrder.status !== "cutting") {
      return {
        ...base,
        message: `Checked in — currently at ${workOrder.status.replace(/_/g, " ")}.`,
        work_order: workOrder,
      };
    }
```

It is the *next* station's scan that moves the piece on. This is coherent, but it means **cutting completion is never explicitly recorded** — it is inferred when someone at the sewing bench scans the piece.

### Skipping, reversing, repeating, partial completion

- **Skipping:** not possible through scanning; the sequence is enforced. One legitimate skip exists in cloth prep (`iron_only` bypasses washing). One **bypass** exists: `settleFabricReceivingForSalesOrder` force-completes every work order on an order, triggered when an invoice is marked sent or paid. So invoicing an order silently marks all its garments finished, whatever the floor actually did.
- **Reversing:** **not supported anywhere in production.** There is no un-scan, no rollback, no correction path for a stage advanced in error. (The pattern track has one small exception: a trial scan can move a job from `revising` back to `drafting`.) This is a significant gap — see §9.
- **Repeating:** safe. A repeat scan at the same stage returns a `checked_in` notice and changes nothing.
- **Partial completion:** supported implicitly and rather well. A suit's jacket and trouser are separate work orders and can sit at different stages. An order is considered finished only when every line is handed off and every work order is `completed`.

### Quantities, waste, rejects, rework, partial deliveries

This is the weakest area of the workflow, and it follows directly from the one-garment-per-line model.

| Concept | Status |
|---|---|
| Garment quantity | Not applicable — one line is one garment. There is **no quantity field on a work order at all** (`src/lib/types/production.ts` lines 19–48) |
| Cloth metres | Tracked on the line and copied to the receipt and work order |
| Cut length actually used | **Not recorded.** Nothing is written at the cutting station |
| Waste / scrap / offcuts | **Missing.** No matching field or code anywhere in `src/lib/production/` |
| Rejects | **Missing** as a production concept. "Reject" in the kiosk code means a rejected *scan*, not a rejected garment |
| Rework | **Partial.** `QUALITY_INSPECTION_RESULTS` includes `"rework"`, but recording it writes a log entry and **does not move, hold, or flag the garment**. A garment failing QC continues down the line as if it passed |
| Cloth defects | **Tracked properly** on the receipt (`FabricDefectReport`: shade, hole, and so on) |
| Partial cloth transfer between orders | **Tracked properly** — `src/lib/sales-orders/transfer-fabric.ts`, with admin approval |
| Partial delivery | **Missing.** A piece is either handed to a driver or not. There is no delivery note, no partial shipment record, no link from a delivered garment to an outbound consignment |

### Where the workflow is incomplete or inconsistent

1. **QC results are decorative.** An inspection that says "rework" has no mechanical effect. Nothing blocks the garment.
2. **No post-stitch pressing stage**, despite ironing being an intended step. The sales milestone mapping compounds the confusion by labelling the `packed` stage as "ironing".
3. **Invoicing force-completes production.** Marking an invoice paid marks every garment on that order `completed`, regardless of floor state.
4. **`superseded` is read but never written.** Eight files reference this status — catalogue sync, the receiving floor, sticker matching, invoiceable-order filtering, the order detail page — but I found **no code path anywhere under `src/` that assigns it**. Either it is set by hand in the database, or the feature was never finished.
5. **Two unconnected "washing" concepts plus a third that is purely financial** — the prep wash, the garment wash, and `washing_cost` in the costing rates, which is an accounting rate with no connection to whether anything was washed.
6. **Delivery is a handover, not a shipment.** `delivery_proof` exists on the type with a comment describing it as future work for a driver app.

---

## 4. Garment scanning and worker tracking

This is the most mature subsystem in the codebase, and the one that most clearly reflects real factory-floor experience.

### How a garment is identified

Each physical piece carries a code generated at order-line creation. The full stored form looks like `FR-0126-0019-SO-2026-0132-L07-JKT-1/2`, which decomposes as: brand prefix (`FR`), client code, sales order number, line/article number (`L07`), piece abbreviation (`JKT` for jacket), and a piece index (`1/2` = first of two pieces).

After the factory re-labels, a **short production code** is used — `FR-0132-L07-JKT-1/2` — and this is what the QR actually encodes (`qrScanPayload` in `src/lib/production/qr-labels.ts`). A third variant, the **fabric-cut code** (`FR-0132-L07`, no piece suffix), identifies the cloth roll at receiving and washing.

The parser in `src/lib/sales-orders/label-codes.ts` handles all three forms plus the paste format mills use, and — a nice touch — keeps `previous_label_stickers` when QC changes a garment type, so already-printed labels still scan.

**Codes are unique per physical piece, not per line.** They are, however, *conventional* strings with no uniqueness constraint behind them.

### Labels

Generated as PDF or PNG label rolls (`src/lib/production/generate-sticker-pdf.ts`), in three sheet types: one cut label per line for prep, one piece label per sticker for production, and a multi-piece cutting pack. Printing is available from the order page and from dedicated print routes.

### What a scan records

Two separate pipelines.

**Stage scan** (`POST /api/production/stage-scan`) writes an append-only `ProductionScanEvent`:

```6:35:src/lib/types/production-scan.ts
export type ProductionScanEvent = {
  id: string;
  scanned_at: string;
  employee_id: string;
  employee_name: string;
  employee_id_number: string;
  station: ScanStation;
  context: ProductionScanContext;
  sticker_code: string;
  ...
  previous_status: string | null;
  new_status: string | null;
```

That is a genuinely good audit record: who, what, where, when, and the status on both sides of the change.

**Stitch kiosk** (`POST /api/production/sewing-session/scan`) is a timing system. A tailor scans their badge, then the garment's A4 QR, which opens a `SewingSession`; scanning again closes it and computes `duration_sec`. Closing a session also fires a `sewing` stage scan, tying the two pipelines together.

### Duplicate, incorrect, concurrent and failed scans

**Duplicates** are handled contextually rather than globally prohibited. A tailor cannot open a second piece while one is open (cutters and chain-stitchers are explicitly exempted). A repeat stage scan returns `checked_in` and changes nothing. A repeat receive returns `already_received`. This is sensible design.

**Unrecognised codes** get genuinely helpful errors. `src/lib/production/sewing-scan-code-explain.ts` distinguishes between a fabric-cut QR scanned at the stitching bench, a badge scanned where a piece was expected, an air waybill, and a piece code that simply is not on the live list. Failures are persisted to `sewing_scan_failures` with up to three write retries.

**Concurrency** is where it gets interesting. All writes are read-whole-document, mutate, write-whole-document. For the stitch kiosk — where several kiosks write simultaneously — there is a real protection layer:

```91:121:src/lib/production/protect-sewing-document-write.ts
  // Stale write with fewer sessions than remote: keep remote sessions missing
  // from incoming (by id) so concurrent kiosks cannot erase each other.
```

Combined with a forced fresh read before every kiosk write, this is a thoughtful mitigation. **But it does not extend to `production_scan_events`.** That document is appended with a plain read-then-write and no merge guard, so two simultaneous stage scans can lose one event. Compare-and-swap is implemented for exactly one document — `pattern_library` — and nothing else (`src/lib/data/document-persistence.ts` lines 293–308).

**Connection failure** is handled well on the kiosk and not at all elsewhere. `src/components/production/stitch-scan-capture.tsx` maintains a sessionStorage queue that survives a page refresh, drains serially, and only dequeues a scan once the server confirms it was durably recorded:

```467:473:src/components/production/stitch-scan-capture.tsx
        const durable =
          !authBlocked &&
          serverProcessed &&
          (ok || data.durable === true || data.failure_recorded === true);
        dequeue = durable;
```

The general stage-scan panel has only an in-memory chain and a 12-second timeout. A dropped connection there loses the scan silently.

### Auditability and corrections

Scan events are append-only with no delete route. Sewing sessions can be corrected, but only through an approval workflow: a supervisor raises a change request (delete, stop, edit, correct start time, confirm overtime), the request stores a **before-snapshot** of the session, and an admin approves it from `/approvals`. That is a proper audit trail for corrections.

The gap: **stage scans have no correction path at all.** If a piece is scanned to `finishing` by mistake, there is no supported way to undo it.

### Productivity and piece rates

**Piece-rate pay does not exist in this system.** `PayrollEmployee` (`src/lib/types/hr-payroll.ts`) holds `salary_amount`, `basic_salary`, `housing_allowance` — fixed monthly salary fields. There is no rate-per-operation, and no code path connects sewing sessions to pay. (The relational schema has `piece_rates` and `piece_work` tables from the original design; they are unused.)

What *does* exist is floor productivity reporting: `aggregateClosedByEmployee` in `src/lib/production/sewing-session-state.ts` totals closed sessions and durations per tailor, excluding rejected overtime. That drives dashboards. It is not exported to payroll.

---

## 5. Patterns, trials, and images

### The model

Three concepts:

- **`BasePattern`** — a house size grid per brand and garment type, with graded measurement points across a size run.
- **`ClientPattern`** — a client's personal pattern for a garment type, derived from a base pattern and size, holding trial versions and CAD files.
- **`PatternJob`** — the workflow item, one per order line, linking an order to a client pattern and tracking status through `pending → assigned → drafting → awaiting_fitting → revising → ready_for_cutting → completed`.

### Versions and approval — the important finding

There are **two independent version concepts**, and they can disagree.

**Trial versions** hold measurements, and one can be marked final:

```263:270:src/lib/types/pattern-library.ts
export interface ClientPatternVersion {
  id: string;
  version: number;
  is_final: boolean;
  trial_date: string | null;
  measurements: ClientPatternMeasurement[];
```

**TUD file versions** are separate: uploaded CAD files with an `active_tud_file_id` pointer, settable per piece.

Can staff identify the approved version? **Partly.** Printed pattern sheets do the right thing — `buildPatternSheetData` prefers `final_version_id`, falling back to the latest trial. But the gate that releases a job to cutting checks only that a pattern is linked and the required TUD files are uploaded:

```15:19:src/lib/pattern/cutting-file-gate.ts
export async function assertPatternJobCuttingFiles(...) {
  if (!job.client_pattern_id) {
    return { ok: false, error: "Link a measurement sheet and upload required .TUD file(s) first." };
  }
```

**It never checks `is_final` or `final_version_id`.** A garment can be released to cutting against measurements nobody has signed off. Note also that the word "approved" does not appear — the UI says "Final" and "Active", which is worth aligning with how the business actually talks about sign-off.

### Measurements and grading

Well developed. Measurements are stored per trial version with base, target, sewn and adjustment values plus remarks. Four CAD parsers are implemented and tested: TUD (TUKA CAD, including the embedded thumbnail), DXF (cut outlines), TUM (marker headers) and RUL (grade rules). With 39 test files, `pattern-library/` is the most thoroughly tested directory in the repository.

### Client trial images

Implemented and linked, which answers the intended capability directly. `ClientPhoto` records live in the `sales_workspace` document with binaries in the private `erp-client-photos` bucket. Pattern staff can assign a wearing photo to a specific fabric line and client pattern, and print assigned photos alongside the pattern sheet. Video is supported. Large files bypass Vercel's 4.5 MB body limit through a signed direct-upload flow.

**Missing: comments and approval.** There is no comment thread on an image and no approve/reject workflow. The only governance is deletion — non-admins must request it and an admin confirms.

### File access control — verified good

All six storage buckets are created private. Confirmed by reading each migration; for example:

```1:8:supabase/migrations/013_erp_client_photos_storage.sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'erp-client-photos',
  'erp-client-photos',
  false,
```

Every file the browser sees is served through an authenticated API route that fetches bytes with the service role and streams them with `Cache-Control: private`. Signed URLs are used only for uploads. An unauthenticated person cannot read a client's photos by guessing a URL. This is the right architecture and it is implemented consistently.

Two caveats. First, every bucket migration ends `on conflict (id) do nothing` — if a bucket was ever created public by hand, the migration will not correct it, and I cannot verify the live state. Second, access is role-and-client scoped, not per-image; any user with client-media permission can see any client's photos they can otherwise access.

### Upload safety

50 MB cap on pattern files, 15 MB on images, 50 MB on video, with extension and MIME classification and empty-file rejection. HEIC is converted to JPEG server-side. **There is no virus or content scanning**, and no image dimension limit or downscaling — `sharp` is used for labels and PDFs but never for uploaded photos. A full-resolution phone image is stored as-is, and HEIC conversion is CPU-bound with no concurrency cap.

### The `/approvals` route

Unrelated to patterns despite the name. It is a phone-friendly page, authorised by a signed token in the URL rather than a login, where an admin approves client name changes, sewing session corrections, and fabric line deletions.

---

## 6. Database and data integrity

### Main entities

| Entity | Key fields | Relates to | Stored in |
|---|---|---|---|
| `ClientProfile` | `id`, `code`, `brand_ids` | → sales orders, patterns, photos | `clients` |
| `SalesOrder` | `id`, `so_number`, `status` | → client; embeds fabric lines | `sales_orders` |
| `SalesOrderFabricLine` | `id`, `garment_type`, `quantity` (metres), `label_stickers[]` | → receipt, work orders, pattern job, invoice line | embedded in `sales_orders` |
| `FabricLabelSticker` | `code`, `piece_name`, `sequence` | The garment's identity | embedded in the line |
| `FabricReceipt` | `sales_order_line_id`, `status` | → order line; spawns work orders | `fabric_receipts` |
| `ProductionWorkOrder` | `sticker_code`, `status`, `fabric_meters` | → order line. **No quantity field** | `production_work_orders` |
| `ProductionScanEvent` | `employee_id`, `station`, `previous_status`, `new_status` | Append-only audit | `production_scan_events` |
| `SewingSession` | `employee_id`, `production_code`, `duration_sec` | → work order, employee | `sewing_sessions` |
| `PatternJob` | `sales_order_line_id`, `status` | → order line, client pattern | `pattern_jobs` |
| `ClientPattern` | `versions[]`, `final_version_id`, `active_tud_file_id` | → client, base pattern | `pattern_library` |
| `CustomerInvoice` | `sales_order_id`, lines | → order; lines carry `sales_order_line_id` | `customer_invoices` |
| `InventoryItem` | `quantity_on_hand` | ← recipes, ledger, cartons | `inventory_store` |
| `PayrollEmployee` | `id`, salary fields | → sewing sessions (by id only) | `payroll_employees` |

**None of these relationships are enforced by the database.** They are conventions between JSON blobs. The foreign keys, unique constraints and check constraints in `001_initial_schema.sql` apply to the relational tables the live workflow does not use.

### What protects each kind of value

**Inventory balances.** Deduction happens when a garment is scanned `packed`, driven by a per-garment-type recipe. It is deduplicated by scanning the ledger for a prior entry on the same order line, and negative stock is permitted deliberately:

```388:394:src/lib/data/inventory-store.ts
/**
 * Pure part of the deduction (exported for tests): mutates the given store
 * in place and reports what happened. Deduped per sales order fabric line so
 * rescans and multi-piece sets (Suit = jacket + trouser on ONE line = one
 * suit hanger) never deduct twice. Stock may go negative on purpose - a red
 * count is the signal that physical stock and ERP disagree.
 */
```

That is a defensible decision, clearly documented. **But the deduplication is fragile in a way the comment does not acknowledge.** The ledger is capped:

```96:102:src/lib/data/inventory-store.ts
async function save(store: InventoryStoreFile): Promise<void> {
  store.updated_at = new Date().toISOString();
  if (store.ledger.length > LEDGER_MAX_ENTRIES) {
    store.ledger = store.ledger.slice(-LEDGER_MAX_ENTRIES);
  }
```

The idempotency key *is* the ledger history. Once a garment's entry rolls off after 2,000 subsequent movements, re-scanning that piece at `packed` will deduct its trims a second time. The comment on the cap says "old entries roll off, stock stays correct" — true for the running balance, but it silently voids the double-deduction guarantee.

**Production quantities.** There is nothing to protect, because there are no quantities — one work order is one piece. Integrity comes instead from the linear stage machine and from guards against duplicate receipt (`receiveFabricLine` returns the existing receipt) and duplicate handoff (throws if already `handed_off`). One gap: `handoffFabricReceiptToProduction` does not check whether work orders already exist for the line; it relies entirely on the receipt's status transition.

**Garment identity.** Codes are deterministically generated and copied onto the work order at creation. Matching is deliberately permissive to handle mill paste formats and retired labels. There is **no uniqueness constraint** — nothing in the database or application prevents two pieces carrying the same code if data is edited or imported badly.

**Order status.** A plain string inside a JSON blob, with transition rules scattered across the modules that care. No enum, no state machine, no database constraint.

### Competing sources of truth

Several, and they are the structural risk in this codebase:

| Fact | Source A | Source B | Consequence |
|---|---|---|---|
| Work orders | `production_work_orders` (per sticker) | relational `work_orders` (per style/SKU) | The Dashboard and Quality picker can show a different shape from the floor |
| Inventory | `inventory_store` (trims) | relational `inventory` + `materials` (cloth) | Same word, different model; Dashboard low-stock reads the **empty** relational table |
| Sales orders | `sales_orders` document | relational `sales_orders` table | Incompatible status enums |
| Quality | `quality_inspections` document | relational `quality_inspections` | `getQualityInspections()` merges both lists |
| Order status | `SalesOrder.status` | derived from receipts + work orders | Invoicing can force one without the other |
| Client identity | `clients` document | denormalised `client_name`/`client_code` on every order | Mitigated by orphan-healing in `writeClients` |

### Migrations and backups

Migrations are versioned SQL files (001–019) applied manually via the Supabase SQL editor or `supabase db push`. **There is no migration runner in the application, and no versioning of the JSON document shapes at all** — schema evolution relies on optional fields and normalise-on-read functions.

For backups, there is no scheduled job and no restore UI. What exists: `scripts/sync-documents-from-supabase.mjs` pulls production documents down into git (an effective if manual backup), `scripts/migrate-json-to-supabase.mjs` pushes the other way, and a handful of bespoke recovery scripts (`restore-wiped-fabric-orders.mjs`, several `restore-*-order.mjs`). **The existence of those recovery scripts is itself evidence that data loss incidents have occurred.** Whether Supabase's own platform backups are enabled cannot be determined from the repository.

---

## 7. Roles, permissions, and traceability

### Roles

Sixteen defined in `src/lib/types/database.ts`. Around eleven are wired into access logic: `super_admin`, `admin`, `client_manager`, `task_operator`, `stitch_operator`, `production_operator`, `sales_operator`, `accounting`, `pattern_operator`, `pattern_maker`, `inventory_clerk`. Five appear dormant — `production_manager`, `purchasing`, `qc_inspector`, `hr_manager`, `viewer` — with no corresponding check in the permission helpers.

Effective role is resolved in `resolveRestrictedAccess()` (`src/lib/auth/permissions.ts`) as first-match-wins over a priority list, drawing on both the `profiles.role` column and **email allowlists from environment variables**, with some individual addresses hardcoded as fallbacks.

### Enforcement: two tiers, and one that is weaker than it looks

**Tier 1 — middleware.** `src/lib/supabase/middleware.ts` resolves the session, then blocks restricted roles from route prefixes they are not allowlisted for, returning 403 for API paths and redirecting pages. This is real server-side enforcement and covers a lot of ground.

**Tier 2 — handler guards.** Many routes then check a specific permission, for example `requireAdmin()`, `canModifySalesOrders(session)`, `canChangeGarmentType(session)`, `requirePatternAccess()`.

The distinction that matters for a reviewer: **middleware allowlisting is coarse.** It answers "may this role touch this URL prefix?", not "may this user perform this operation?". Where a handler has no further check, any role that can reach the prefix can perform the action. From the sampled routes:

| Route | Enforcement |
|---|---|
| `api/hr/payroll-adjustments` (POST) | `requireAdmin()` — real role check |
| `api/sales-orders` (POST) | `canModifySalesOrders(session)` — real role check |
| `api/sales-orders/[id]/fabric-lines/transfer` (POST) | `canTransferFabric(session)` — admin/QC only |
| `api/pattern/library/client-patterns` (POST) | `requirePatternAccess()` — real role check |
| `api/inventory/items/[id]/adjust` (POST) | `requireAuthenticated()` only — any role reaching `/api/inventory` can adjust stock |
| `api/fabric-order-drafts` (PUT) | `requireAuthenticated()` only |
| **`api/production/stage-scan` (POST)** | **No check in the handler at all** — middleware only |

I read that last route in full to confirm it, and found something more consequential than a missing guard.

### The unattributed scan

The handler accepts `require_employee` **from the request body** and passes it straight through:

```43:50:src/app/api/production/stage-scan/route.ts
    const result = await executeStageScan({
      code,
      station,
      context: context === "fabric-receiving" ? "fabric-receiving" : "production",
      employee_id: body.employee_id,
      workstation_id: body.workstation_id,
      require_employee: body.require_employee,
    });
```

Inside, that flag decides whether a badge is needed — and the audit event is written **only if an employee was resolved**:

```84:99:src/lib/production/execute-stage-scan.ts
  if (employee) {
    const newStatus = ...
    await recordProductionScanEvent({ ... });
  }
```

So a caller who posts `{ code, station, require_employee: false }` with no `employee_id` advances the garment's production stage and **no scan event is recorded at all**. The stage change is real and persisted; the audit trail simply has nothing in it. The caller chooses whether to be audited.

Notably, the API-key route `/api/v1/production/scan` is *stricter* — it hardcodes `require_employee: true` and rejects a missing `employee_id` (lines 43–45, 53). The public integration surface is better protected than the internal one.

### The v1 surface bypasses roles entirely

All 108 routes under `/api/v1/` are exempted from session middleware:

```85:86:src/lib/supabase/middleware.ts
  const isPublicApiRoute =
    pathname.startsWith("/api/v1/") ||
```

and authenticate solely with a shared `ERP_API_KEY` via `verifyApiKey` (`src/lib/integrations/api-auth.ts`) accepting either a bearer token or an `x-api-key` header. A search across all v1 routes found **zero** uses of `requireAdmin`, `requireAuthenticated`, or any role helper. Whoever holds that one key can post payroll adjustments, adjust inventory, mutate sales orders and patch invoices — operations that require admin on the session side. It is a single shared secret with full write authority and no per-caller identity.

### Logging and traceability

Three separate trails:

1. **`activity_events`** — the user-facing history. Actor email, name and team are captured from the session. But it is gated by a whitelist of exactly 27 action types (`RECORDED_ACTIVITY_EVENTS`, `src/lib/data/activity-events.ts` lines 107–135), so many events — including invoice updates, payroll changes, inventory movements and production scans — are emitted but never recorded here.
2. **`integration_events`** — everything passed to `notifyIntegration()`, capped at the last 200 events, also fanned out to Zapier.
3. **`production_scan_events`** and **`login_events`** — domain-specific, and the most complete records in the system.

Can a change be traced to a person? Usually yes, when it comes through the UI with a session. Three holes: unattributed stage scans (above), v1 API calls that record `"api"` or accept a caller-supplied `added_by` field (spoofable by anyone with the key), and the whitelist gaps in the activity log.

### Credentials and bypasses

No plaintext passwords in source. Worth knowing about:

- A hardcoded fabric-price unlock code in `src/lib/auth/fabric-price-access.ts` line 38, accepted unconditionally even when the corresponding environment variable is unset.
- **Demo mode** activates whenever Supabase is unconfigured and grants full access to any email with no verification (`src/lib/auth/demo-mode.ts`). Safe as long as production always has Supabase configured — a misconfiguration would silently open the application.
- Development impersonation via cookie, correctly gated to `NODE_ENV=development`.
- Token-authorised `/approvals` links valid for seven days, bypassing login by design.
- Badge passwords are scrypt-hashed in `src/data/badge-login-credentials.json`; the synthetic Supabase password is derived by HMAC from the service role key.

---

## 8. Operational readiness

**Validation.** Good at the domain layer — parsers, normalisers and guard functions are used consistently, and several modules have dedicated input validators. Weaker at the HTTP boundary: request bodies are typically cast with `as` rather than parsed against a schema. There is no validation library (no zod or equivalent). The `require_employee` finding in §7 is precisely this class of bug — a request field trusted without question.

**Error handling.** Route handlers wrap work in try/catch and map messages to status codes, often by substring matching on the error text (`message.includes("not recognized") ? 404 : ...`). It works, but it couples HTTP behaviour to human-readable strings.

**Tests.** 166 test files, **1,154 tests, 1,148 passing, 6 failing** — I ran the suite to confirm. The failures are:

```
src/lib/fabric-sourcing/fabric-order-line-status.test.ts
src/lib/integrations/shipment-destination.test.ts
src/lib/integrations/shipment-supplier.test.ts
src/lib/sales-orders/fabric-cost.test.ts
"accidental cm convert (Moussa 148.91) restores to inches"
"groupFabricReceivingCutsByClient keeps missing client codes under Unassigned"
```

Coverage is genuinely strong in the domain logic — pattern library (39 files), production (27), sales orders (19), auth (14), invoicing (13). It is also **almost entirely unit-level**. There are no integration tests, no API route tests, and no end-to-end tests. The persistence layer, the middleware, and every one of the 324 route handlers are untested. Since those are exactly where the §7 findings live, the high test count should not be read as high confidence in the system as deployed.

Running the suite also requires an unusual incantation (`node --experimental-strip-types --experimental-loader ./scripts/tsconfig-paths-loader.mjs --test`), and there is **no `test` script in `package.json`** — only 20-odd scripts that each run one file.

**Type safety.** 263 TypeScript errors at HEAD, concentrated in `SalesOrderActions.tsx` (18), test files, and `src/lib/supabase/middleware.ts` (8). `ignoreBuildErrors: true` means none of them stop a deploy.

**CI/CD.** No `.github/` directory. Nothing runs tests, type checks or lint before merge or deploy. The only automated gate is the custom `audit:document-loads` script wired into `npm run build`. Vercel builds are confirmed running; they do not verify correctness.

**Migrations.** Versioned SQL, applied by hand. No runner, no record of what has been applied to production, no JSON document schema versioning.

**Backups.** Manual pull-to-git only. No schedule, no restore procedure, no tested recovery. The presence of several bespoke `restore-*` scripts suggests this has been needed in anger.

**Logging.** Application events are captured in the three trails described in §7. There is no structured application logging, no error aggregation service, and no metrics. Diagnosing a production issue would mean reading Vercel function logs.

**File upload safety.** Size caps and MIME/extension checks are in place and buckets are private. No malware scanning, no image dimension limits, and unbounded HEIC conversion on the server.

**Mobile and scanner usability.** Clearly built by someone who has watched the floor. USB scanner fragment merging, a 30-second grace window for badge-then-QR close, stacked sessions for cutters, phone-friendly approvals, dedicated print layouts for A4 sheets and thermal rolls. The stitch kiosk's offline queue is the standout. The gap is that this care did not extend to the general stage-scan panel, which has no offline resilience.

**Performance.** The architecture has a clear ceiling. Every read of any order loads the entire `sales_orders` document (1.6 MB today); every write rewrites it. `pattern_library` is 5.1 MB. This is fine at current volume and degrades linearly with growth — it cannot be indexed, paginated or partially updated without changing the storage model. A 30-second cache TTL and an in-process document cache mitigate reads, at the cost of staleness across serverless instances.

**What is verified, inferred, and untested:**

- *Verified by running or reading:* test results, type error count, absence of CI, build configuration, bucket privacy settings, the stage-scan authorisation gap, the inventory ledger cap, the absence of any `washing_batches` write, migration contents.
- *Inferred from code:* that production uses Supabase documents (the switch and the sync script's comments say so, but I have no live access); that last-write-wins occurs on unprotected documents under concurrent writes (follows from the architecture, not observed).
- *Requires the deployed environment:* which migrations are applied; whether Supabase backups are on; real concurrency behaviour under multi-kiosk load; whether any bucket was created public before its migration ran; actual role assignments; whether `ERP_API_KEY` is rotated.

---

## 9. Gaps and risks

### Critical

**1. Production stages can be advanced with no attribution, by an unauthenticated-at-handler route.**
*Evidence:* `src/app/api/production/stage-scan/route.ts` has no session or role check; `require_employee` comes from the request body; `src/lib/production/execute-stage-scan.ts` line 84 writes the audit event only `if (employee)`.
*Impact:* The stage change persists while the audit trail records nothing. Any authenticated user whose role can reach `/api/production/*` can move garments and leave no trace. This undermines the scanning system's entire value as a record of who did what.
*Next step:* Add `requireAuthenticated()` plus a production-role check in the handler; stop accepting `require_employee` from the client; record an event even when no badge was scanned, marking it explicitly unattributed.

**2. One shared API key grants unrestricted write access to every module.**
*Evidence:* `/api/v1/*` is exempted in `src/lib/supabase/middleware.ts` line 85; `verifyApiKey` is the only check across all 108 routes; no role helper appears in any of them.
*Impact:* Key compromise means full control — payroll, inventory, invoices, orders — with no per-caller identity and no way to revoke one consumer without breaking all of them.
*Next step:* Scope keys per integration with an allowed-operations list; at minimum, apply the same role checks the session routes use, and record the key identity on every mutation.

**3. No backup schedule and no tested restore.**
*Evidence:* Backup is a manual script; several bespoke `restore-*` recovery scripts exist in `scripts/`.
*Impact:* All operational data lives in ~45 JSONB rows. A bad write to `sales_orders` or `pattern_library` — each a single row containing everything — loses the business's records wholesale.
*Next step:* Confirm Supabase point-in-time recovery is enabled; schedule the document pull; rehearse a restore.

**4. Concurrent writes can silently lose data on most documents.**
*Evidence:* Compare-and-swap exists only for `pattern_library` (`document-persistence.ts` lines 293–308); merge protection only for the sewing documents. `sales_orders`, `production_work_orders`, `inventory_store` and `production_scan_events` have neither.
*Impact:* Two users editing different orders concurrently, on different serverless instances, can have one change overwritten with no error shown.
*Next step:* Extend the existing `updated_at` compare-and-swap to all mutable documents — the mechanism is already written and proven for one key.

**5. Demo mode grants unauthenticated full access if Supabase config is ever absent.**
*Evidence:* `src/lib/auth/demo-mode.ts` — `DEMO_MODE = !isSupabaseConfigured()`; any email signs in.
*Impact:* A missing or mistyped environment variable on deploy converts the ERP into an open system rather than failing closed.
*Next step:* Refuse to enable demo mode when `NODE_ENV === "production"` or `VERCEL === "1"`.

### High

**6. QC results have no mechanical effect.** A `"rework"` or `"fail"` inspection writes a log line; the garment continues down the line unflagged (`src/lib/quality/`, and no status coupling in `stage-scan.ts`). *Next step:* have a failed inspection set a hold flag the next stage scan must clear.

**7. No way to reverse a mis-scan.** The stage machine only advances (`getNextProductionStage`). Sewing sessions have a full approval-based correction workflow; stage scans have nothing. *Next step:* add an admin correction path modelled on the existing `sewing_session_change_requests`.

**8. Inventory double-deduction becomes possible once the ledger rolls over.** The dedup key is the ledger itself, capped at 2,000 entries (`inventory-store.ts` lines 24, 96–102). *Next step:* store a deduction marker on the work order or order line rather than relying on prunable history.

**9. Cutting records nothing.** No cut length, no piece confirmation, no waste (`stage-scan.ts` lines 227–239). Cutting completion is inferred when someone scans at sewing. *Next step:* decide whether cloth utilisation matters commercially; if so, capture metres at the cutting scan.

**10. Invoicing force-completes production.** Marking an invoice sent or paid sets every work order on the order to `completed` (`customer-invoice-mutations.ts`, `settleFabricReceivingForSalesOrder`). *Next step:* separate commercial status from physical status, or at least warn when settling an order with unfinished pieces.

**11. Cutting can start from unapproved measurements.** The gate checks linkage and TUD files, never `is_final` (`src/lib/pattern/cutting-file-gate.ts`). *Next step:* require a final trial version, or make the omission a deliberate, documented decision.

**12. No CI and 263 unchecked type errors.** No `.github/`; `ignoreBuildErrors: true`. *Next step:* add a workflow running the existing 1,154 tests on pull requests — the suite already exists and is 99.5% green.

**13. No partial delivery.** Delivery is a driver handover per piece with no consignment, delivery note, or record of what went out together. *Next step:* clarify whether the business needs delivery documentation, then model it.

### Medium / low

**14. Six failing tests** left unfixed, which erodes trust in the suite as a signal.

**15. The Washing page is non-functional** — mock data in demo mode, a table nothing writes otherwise, and a dead button. Either build it or remove it; right now it misrepresents the system's capabilities to anyone evaluating it.

**16. Dashboard shows fabricated figures** in demo mode and reads low-stock from the empty relational `inventory` table rather than the live trim store.

**17. Dual persistence models** (documents vs relational) mean a reader must first work out which path is live for each feature. The relational schema is well built but mostly dead weight; a decision to finish or delete it would reduce the maintenance surface considerably.

**18. `superseded` is filtered in eight files but assigned in none** — an unfinished feature or an out-of-band manual process.

**19. No malware scanning or image downscaling** on uploads; unbounded HEIC conversion is a plausible denial-of-service vector.

**20. Hardcoded fabric-price unlock code** accepted unconditionally (`fabric-price-access.ts` line 38).

**21. Document growth has no ceiling** — `sales_orders` is read and rewritten whole on every change.

**22. No `test` script in `package.json`**, and the runner needs experimental Node flags, which makes the suite easy to ignore.

**23. Activity log whitelist omits** invoices, payroll, inventory and production scans, so the user-facing history is materially incomplete.

**24. Five roles defined but dormant**, and a user holding one may fall through to broad default access — worth checking against real profile data.

---

## 10. Walkthrough: an order for 100 garments

No records were created or modified for this section; it traces what the code would do.

### First, the framing the system imposes

The system has **no concept of a batch of 100**. `SalesOrderFabricLine.quantity` is metres of cloth, and `ProductionWorkOrder` has no quantity field at all. So an order for 100 garments is **100 separate fabric lines**, each with its own cloth, its own codes, and its own work orders. If those were suits, the factory would be tracking **200 work orders** — one per jacket, one per trouser.

That is correct for bespoke tailoring, where every garment belongs to a different named client. It means any genuine 100-unit repeat order would be entered as 100 near-identical lines, and every screen, print sheet and scan interaction would treat them as 100 unrelated garments.

### What happens, step by step

**Order entry.** Sales creates the order at `/orders/new`, status `open`. Each of the 100 lines gets its cloth, garment type and metres. On save, `generateFabricLabelStickers` produces codes per line — for line 7 of a suit, `…-L07-JKT-1/2` and `…-L07-TR-2/2`. *Supported.*

**Purchasing.** Fabric POs are raised per mill; status becomes `fabric_pos_created`. PO emails are grouped and sent from `/supplier-emails`. Replies and air waybills are matched automatically by the IMAP inbox scan. *Supported.*

**Receiving.** Cloth arrives; a task operator scans each cut label at station `receive`. A `FabricReceipt` is created per line — 100 receipts. Re-scanning returns `already_received`. *Supported.*

**Preparation.** Each receipt is scanned through `wash` → (drying) → `iron`, or `soak` → `iron`, or ironing alone. Timestamps are written per step. *Supported.*

**Handoff.** Prep completion sets the receipt `handed_off` and creates the work orders at `cutting` — 200 of them for suits. *Supported.*

**Patterns.** In parallel, 100 `PatternJob` records were created at order confirmation. Each needs a linked client pattern and uploaded TUD files before a `pattern_tud_ready` scan releases it. *Supported — but the gate does not require an approved (final) measurement version.*

**Cutting.** A cutter scans a piece: it says "Cutting — Jacket. Ready to cut." and records a scan event. Nothing else is written. Cut length and waste are **not captured**. *Partially supported.*

**Stitching, with worker scans.** A tailor scans their badge, then the garment's A4 QR. A `SewingSession` opens with employee id, name, production code, workstation and start time. The work order moves `cutting → sewing`. When the tailor scans again to close, `duration_sec` is computed and a `sewing` stage scan fires, producing a `ProductionScanEvent` with the previous and new status. If the network is down, the kiosk queues the scan in sessionStorage and retries until the server confirms durability. If two tailors are on the same piece, closing requires the finishing tailor's badge to disambiguate. *Fully supported — this is the system's strongest flow.*

**Washing and finishing.** Scans at `garment_wash` then `finishing` advance each piece. *Supported.*

**Packing.** A scan at `packed` advances the piece and deducts trims — hanger, buttons, thread — per the garment recipe, deduplicated per order line so a suit's two pieces deduct one hanger. Stock may go negative. *Supported, with the ledger-rollover caveat from §9.*

**Quality control.** An inspector can log an inspection at `/quality` with a pass, rework or fail result. **Nothing happens as a consequence.** A failed garment keeps moving. *Missing.*

**Partial delivery — 60 now, 40 later.** Here the walkthrough breaks down. Each finished piece can be marked `completed` individually through the delivery form, which requires naming who took it (factory driver or client driver) and can attach a proof photo. So 60 garments can be marked delivered while 40 remain in production — **piece-level partial completion is supported**.

What is **not** supported is partial delivery as a business event. There is no delivery note, no consignment record grouping those 60 garments, no document to hand the client, no record that a partial shipment occurred, and nothing linking the 60 to an invoice covering them. The outbound half of `shipments` exists in the type but the module only handles inbound cloth. To know what went out, someone would have to filter work orders by `handed_to_driver_at` and reconstruct it.

And if the client is invoiced for all 100 at that point, marking the invoice sent will set **all 200 work orders to `completed`**, including the 40 still on the floor.

**Summary for this walkthrough:**

| Step | Verdict |
|---|---|
| 100-line order entry, codes, labels | Supported (as 100 bespoke garments, not a batch) |
| Purchasing, inbox matching, AWB tracking | Supported |
| Receiving and cloth prep by scan | Supported |
| Pattern linkage and release to cutting | Supported; approval not enforced |
| Cutting | Status only — no length, pieces or waste |
| Tailor badge + garment scan, timed sessions | Fully supported, with offline resilience |
| Wash, finish, pack, trim deduction | Supported |
| QC affecting the garment | **Missing** |
| Partial completion at piece level | Supported |
| Partial *delivery* as a document or event | **Missing** |
| Reversing a mis-scan | **Missing** |
| Waste, rejects, rework quantities | **Missing** |

---

## 11. Questions and recommended next steps

### Questions the code cannot answer

**About the business:**
1. Does the factory ever run true batch production, or is everything one-off bespoke? The answer determines whether the missing quantity model is a gap or a correct simplification.
2. Does cloth utilisation and waste need measuring? Cutting currently records nothing, and adding it is intrusive for cutters.
3. What should happen to a garment that fails QC — hold, rework loop, scrap? The result is recorded but has no consequence.
4. Do clients receive delivery documentation? If so, partial delivery needs a real model.
5. Is piece-rate pay used or planned? The relational schema anticipates it; the live system is salary-only.
6. Should invoicing force production complete, or is that a workaround for something else?
7. What is `superseded` meant to do, and who sets it today?
8. Is post-stitch pressing a real distinct operation, or is it part of finishing?

**About operations:**
9. Are Supabase point-in-time backups enabled, and has a restore ever been rehearsed?
10. Which of the 19 migrations are actually applied to production?
11. How many people hold the `ERP_API_KEY`, and has it been rotated?
12. How many concurrent users and kiosks are realistic at peak? This determines how urgent the concurrency work is.
13. Has data loss occurred before? The recovery scripts suggest yes, and the circumstances would sharpen the priorities below.

### Recommended sequence

**First — verify before building anything.** Confirm backups and rehearse a restore. Confirm which migrations are applied. Confirm no storage bucket is public. Audit who holds the API key. None of this changes code, and all of it is prerequisite to trusting the rest.

**Second — close the attribution and authorisation holes.** Add the missing handler guard to `stage-scan` and stop trusting `require_employee` from the request body; record unattributed scans explicitly rather than dropping them. Make demo mode impossible in production. Scope or restrict the v1 API key. These are small, contained changes to a handful of files with disproportionate benefit.

**Third — make the safety net real.** Add a CI workflow running the existing suite; it is already 99.5% green, so this is close to free. Fix the six failing tests. Extend the existing compare-and-swap from `pattern_library` to the other mutable documents — the mechanism is written and proven, it needs generalising rather than inventing.

**Fourth — close the workflow gaps the business confirms matter.** Most likely: a correction path for mis-scans, QC results that actually hold a garment, and the inventory dedup marker moved off the prunable ledger. Partial delivery and cutting capture depend on the answers to questions 2 and 4.

**Fifth — reduce structural risk.** Decide the fate of the relational schema: finish it or delete it, but stop maintaining both. Remove or build the Washing page and the demo dashboard figures. Plan for document growth before `sales_orders` becomes unwieldy.

I would not recommend implementing anything from the third step onward until the questions above are answered, since several of them could change the design substantially.

---

## Closing assessment

This is a serious, working system, and it would be a mistake to read the length of the gaps list as a verdict on its quality. The bespoke workflow from order through purchasing, receiving, pattern, production and invoicing is genuinely implemented and connected. The scanning and stitch-kiosk subsystem in particular shows real operational understanding — the offline queue, the badge disambiguation when two tailors share a piece, the scanner fragment merging, the approval-based correction trail. Those are details you only get right after watching a factory floor. The domain logic is well separated and carries 1,154 tests.

The risks are concentrated in three places, and they are consistent with a system built quickly by a small team under delivery pressure. **Authorisation is uneven** — strong in some handlers, absent in others, and effectively absent across the entire API-key surface. **The persistence model has no concurrency control** on most documents and no tested backup, which is the most serious exposure given that the whole business sits in about 45 JSON blobs. And **the safety net is missing**: no CI, type errors disabled at build, six failing tests left red, so nothing catches a regression before it reaches the factory.

None of these require redesign. The compare-and-swap mechanism already exists for one document and needs generalising. The permission helpers already exist and need applying consistently. The test suite already exists and needs a workflow file. The highest-value work here is finishing patterns already established in the codebase rather than introducing new ones.
