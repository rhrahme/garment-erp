---
name: hagan-erp-side-effects
description: Which code in this ERP reaches the real world - emails to real suppliers, 17TRACK and Zapier writes, cron jobs, inbound mail processing - and how to inspect it without sending anything. Nothing here is a sandbox. Use before running any script, route or test that touches integrations, email or shipments.
---

# Operations that leave the building

There is no dev environment, no staging mailbox and no dry-run flag. If the
credentials are present, the code sends. Read this before you execute anything
under `src/lib/integrations/` or `src/lib/email/`.

## There is no mail safety rail

`sendEmail` in `src/lib/email/smtp.ts` has exactly two guards, and neither of
them is a safety check:

- no SMTP config -> throws
- zero recipients -> throws
- otherwise -> `transport.sendMail(...)`, a real message to a real address

There is no test mode, no allowlist, no "only send on production" gate.

`isVercelDeployment()` at line 48 looks like that gate and **is not**. It only
blocks saving the SMTP password and changes an error message. A developer
machine with `SMTP_*` set sends real mail exactly like production does.

## Who can actually receive mail from this system

Only one destination is external, and it is the one that matters most:

| Path | Recipient |
| --- | --- |
| `POST /api/fabric-orders/send-email` | **a real fabric supplier** |
| `POST /api/v1/fabric-orders/[id]/send` | **a real fabric supplier** |

Everything else goes to internal staff, resolved from `ADMIN_EMAILS`,
`SUPER_ADMIN_EMAILS` or `PATTERN_EMAILS` - the `*-alert*.ts` modules, pattern
operator notices, badge-login notices, the auth health cron. No verified
automated path emails a client.

Treat the two supplier routes as live wires. A stray POST puts a purchase order
in a mill's inbox.

## Mail sends from places that do not look like mail

`src/app/(dashboard)/layout.tsx` calls `checkEurSarRateAlert()` on every
authenticated dashboard page load. If the EUR/SAR rate crosses the threshold and
the cooldown has lapsed, **loading a page emails the super-admins**.

So "I only opened the dashboard" is not a safe statement. When you are
reasoning about why an alert fired, page loads are a real trigger.

## Third-party writes

Read-only toward the vendor (they only write local JSON):

- `caccioppoli/` - `CACCIOPPOLI_API_TOKEN`, throws when unset
- `drapers/` - `DRAPERS_API_KEY`, throws when unset
- `clickup/` - `CLICKUP_API_TOKEN`, route returns 400 when unset

Actually write to the outside world:

- `track17/` - `registerTrackings()` POSTs AWBs to 17TRACK. Throws when
  `TRACK17_API_KEY` is unset, but `createInboundShipmentFromAwb` quietly skips
  registration instead.
- `zapier.ts` - POSTs to `ZAPIER_WEBHOOK_URL`. **Silently returns when unset**:

```ts
const url = getZapierWebhookUrl();
if (!url) return;
```

That silence cuts both ways. Absence of a Zapier event in your local run proves
nothing about production.

`createInboundShipment` writes locally *and* registers the AWB with 17TRACK when
configured. `order-shipments.ts`, `pending-awb.ts` and `normalize-awb-scan.ts`
are read-only and safe.

## Inbound mail is deduped by message id, but not completely

`src/lib/email/inbound/` scans the IMAP inbox and turns supplier and transporter
replies into stored records. Dedupe is by email `message_id`, with transporter
mail namespaced as `transporter:${message_id}` so the two pipelines cannot
collide.

The dedupe is not total. Re-scanning an already-processed supplier email still
re-runs `upsertSupplierReply` and `applySupplierAvailabilityUpdates`. What it
skips is `markEmailProcessed`, the invoice re-save and the Zapier event. If you
are debugging duplicated supplier data, that partial path is the first place to
look.

## Cron and API keys

Four scheduled jobs in `vercel.json`, all authenticated by `CRON_SECRET`:

| Route | Schedule (UTC) | Side effect |
| --- | --- | --- |
| `/api/cron/supabase-auth-health` | `0 0 * * *` | emails super-admins + Zapier on failure |
| `/api/cron/stitch-kiosk-workday-end` | `0 19 * * *` | closes forgotten Live sewing sessions |
| `/api/cron/stitch-kiosk-lunch-pause` | `0 11 * * *` | pauses kiosk, Zapier event |
| `/api/cron/stitch-kiosk-lunch-resume` | `0 13 * * *` | resumes kiosk, Zapier event |

`verifyCronSecret` returns `false` when `CRON_SECRET` is unset, so every cron
route 401s rather than running unauthenticated. `verifyApiKey` returns **503**
when `ERP_API_KEY` is unset, which blocks all of `/api/v1/*`.

Neither of those protects the session-authenticated routes. `POST
/api/fabric-orders/send-email` needs only an admin session.

The one inbound webhook, `/api/webhooks/17track`, is public in middleware and
verified solely by `sha256(rawBody + "/" + TRACK17_API_KEY)` against the `sign`
header. It only writes locally.

## Do not casually execute

Any of these, when the matching credential is configured:

- `sendEmail` and every caller
- `POST /api/fabric-orders/send-email`, `POST /api/v1/fabric-orders/[id]/send`
- `POST /api/email/send-test`, `POST /api/exchange-rates/test-alert`
- `POST /api/email/scan-inbox`, `POST /api/v1/email/scan-inbox`
- `POST /api/shipments/sync`, `POST /api/v1/shipments`, `POST /api/v1/supplier-replies`
- `emitZapierEvent` / `notifyIntegration`
- `npm run sync:clickup` - overwrites local order JSON, defaults to `reset: true`
- `npm run drapers:sync-*`, `npm run caccioppoli:*`

## Safe inspection

Reading source is always safe. Beyond that, the `GET` twins report configuration
without sending: `GET /api/email/status`, `GET /api/email/scan-inbox`,
`GET /api/v1/health`, `GET /api/shipments/sync`. `getFollowUpOrders()` and
`listStoredShipments()` are local reads.

Only one integration test is wired: `npm run test:drapers-catalog`.
`shipment-supplier.test.ts` and `shipment-destination.test.ts` import `vitest`,
which is **not a dependency of this repo**, so they cannot run as written.

## When you need to prove a send would work

Do not send. Construct the payload and print it, or assert on the recipient list
the code would have used. If the user genuinely wants a supplier emailed, say
which route does it and let them press the button.
