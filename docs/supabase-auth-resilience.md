# Supabase Auth resilience

GoTrue (`/auth/v1/*`) can occasionally return **522 / timeout** while Postgres and the rest of the project stay up. This app mitigates that with automated monitoring, optional auto-restart, login retries, and admin alerts.

## What runs automatically

| Component | Behavior |
|-----------|----------|
| **Vercel Cron** | `GET /api/cron/supabase-auth-health` every **5 minutes** |
| **Health probe** | `GET {SUPABASE_URL}/auth/v1/health` with publishable/anon key |
| **Auto-restart** | `POST https://api.supabase.com/v1/projects/{ref}/restart` when unhealthy (30 min cooldown) |
| **Alerts** | Email to `SUPER_ADMIN_EMAILS` + optional Zapier webhook (max 1/hour) |
| **Login** | Up to **3** sign-in attempts with backoff before returning 503 |
| **Banner** | Amber warning in the app for ~15 min after a failed health check |

## Required Vercel environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `CRON_SECRET` | **Yes** (for cron) | Random secret; Vercel sends `Authorization: Bearer …` on cron invocations |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Project URL (used to derive project ref) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Health probe + client auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Recommended | Persists last health check in `erp_documents` |
| `SUPER_ADMIN_EMAILS` | Recommended | Alert recipients on auth failure |

Generate `CRON_SECRET` (example):

```bash
openssl rand -hex 32
```

Add it in **Vercel → Project → Settings → Environment Variables**, then redeploy so `vercel.json` crons are active.

## Optional: automatic project restart

Create a [Supabase personal access token](https://supabase.com/dashboard/account/tokens) (`sbp_…`) and add:

| Variable | Purpose |
|----------|---------|
| `SUPABASE_ACCESS_TOKEN` | Bearer token for Management API restart |
| `SUPABASE_PROJECT_REF` | Optional override (default: parsed from `NEXT_PUBLIC_SUPABASE_URL`, e.g. `gigzktsxlhesolhrgxxn`) |

Management API call (same as the cron job):

```bash
curl -X POST "https://api.supabase.com/v1/projects/YOUR_REF/restart" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Restart is available on paid Supabase plans via the dashboard; the Management API uses the same capability. If the token is missing or restart fails, the cron still logs and emails — restart the project manually in **Project Settings → Infrastructure**.

## Manual test

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://YOUR-ERP-DOMAIN/api/cron/supabase-auth-health"
```

Public status (banner source):

```bash
curl "https://YOUR-ERP-DOMAIN/api/health/auth"
```

Admins see extra fields when signed in.

## Upgrade note

If Auth outages persist on the free tier, consider upgrading the Supabase project compute tier — restarts recover GoTrue but do not fix underlying capacity limits.
