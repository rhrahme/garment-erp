#!/usr/bin/env bash
# One command: push latest code + copy .env.local Supabase vars to Vercel + redeploy.
set -e
cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "Missing .env.local in $(pwd)"
  exit 1
fi

read_env() {
  grep -m1 "^${1}=" .env.local | sed "s/^${1}=//" | sed 's/^"//;s/"$//'
}

read_smtp_pass() {
  local from_env
  from_env="$(read_env SMTP_PASS 2>/dev/null || true)"
  if [ -n "$from_env" ]; then
    printf '%s' "$from_env"
    return
  fi
  if [ -f smtp-secret.local.json ]; then
    python3 -c "import json; print(json.load(open('smtp-secret.local.json')).get('password','').strip())"
  fi
}

env_value() {
  if [ "$1" = "SMTP_PASS" ]; then
    read_smtp_pass
    return
  fi
  read_env "$1"
}

find_npm() {
  if command -v npm >/dev/null 2>&1; then
    command -v npm
    return
  fi
  if [ -x /opt/homebrew/bin/npm ]; then
    echo /opt/homebrew/bin/npm
    return
  fi
  if [ -x /usr/local/bin/npm ]; then
    echo /usr/local/bin/npm
    return
  fi
  echo ""
}

NPM="$(find_npm)"
if [ -z "$NPM" ]; then
  echo "Node/npm not found. Install from https://nodejs.org then run this again."
  exit 1
fi

VERCEL="$NPM exec -- vercel"

echo "→ Pushing code to GitHub..."
if git push origin main; then
  echo "   Git push OK"
else
  echo "   Git push failed — if repo is already up to date, continuing..."
fi

echo "→ Checking Vercel login..."
if ! $VERCEL whoami >/dev/null 2>&1; then
  echo "   Log in to Vercel in the browser when prompted..."
  $VERCEL login
fi

echo "→ Linking project (pick garment-erp if asked)..."
$VERCEL link --yes 2>/dev/null || $VERCEL link

set_vercel_env() {
  local key="$1"
  local value="$2"
  $VERCEL env rm "$key" production -y >/dev/null 2>&1 || true
  printf '%s' "$value" | $VERCEL env add "$key" production
}

# Skip placeholder / empty values — only push real secrets from .env.local
is_real_env_value() {
  local val="$1"
  [ -n "$val" ] || return 1
  case "$val" in
    your-*|your_*|pk_your_*|xxxxx*|xxxxx/*|change-me*|CHANGEME*|placeholder*)
      return 1
      ;;
  esac
  return 0
}

set_vercel_env_optional() {
  local key="$1"
  local value="$2"
  if is_real_env_value "$value"; then
    echo "→ Setting Vercel env: $key"
    set_vercel_env "$key" "$value"
    return 0
  fi
  echo "   Skipping $key (not set or placeholder in .env.local)"
  return 1
}

SUPABASE_URL="$(read_env NEXT_PUBLIC_SUPABASE_URL)"
SUPABASE_KEY="$(read_env NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)"
SERVICE_KEY="$(read_env SUPABASE_SERVICE_ROLE_KEY)"
ADMIN_EMAILS="$(read_env SUPER_ADMIN_EMAILS)"
APP_URL="https://garment-erp-eta.vercel.app"

for pair in \
  "NEXT_PUBLIC_SUPABASE_URL|$SUPABASE_URL" \
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY|$SUPABASE_KEY" \
  "SUPABASE_SERVICE_ROLE_KEY|$SERVICE_KEY" \
  "SUPER_ADMIN_EMAILS|$ADMIN_EMAILS" \
  "NEXT_PUBLIC_APP_URL|$APP_URL"; do
  key="${pair%%|*}"
  val="${pair#*|}"
  if [ -z "$val" ]; then
    echo "Missing $key in .env.local"
    exit 1
  fi
  echo "→ Setting Vercel env: $key"
  set_vercel_env "$key" "$val"
done

# Optional integrations — sync when present locally (SMTP, IMAP, Zapier, ClickUp, API key)
OPTIONAL_SYNCED=()
OPTIONAL_SKIPPED=()
for key in \
  ERP_API_KEY \
  ZAPIER_WEBHOOK_URL \
  SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS SMTP_FROM SMTP_FROM_NAME \
  IMAP_HOST IMAP_PORT IMAP_SECURE IMAP_USER IMAP_PASS \
  CLICKUP_API_TOKEN; do
  val="$(env_value "$key" 2>/dev/null || true)"
  if set_vercel_env_optional "$key" "$val"; then
    OPTIONAL_SYNCED+=("$key")
  else
    OPTIONAL_SKIPPED+=("$key")
  fi
done

if [ ${#OPTIONAL_SYNCED[@]} -gt 0 ]; then
  echo "   Synced optional vars: ${OPTIONAL_SYNCED[*]}"
fi
if [ ${#OPTIONAL_SKIPPED[@]} -gt 0 ]; then
  echo "   Skipped (add in .env.local or Vercel dashboard): ${OPTIONAL_SKIPPED[*]}"
fi

echo "→ Deploying to production..."
$VERCEL --prod --yes

echo ""
echo "Done. Open: https://garment-erp-eta.vercel.app/login"
echo "Then in Supabase → Authentication → URL Configuration:"
echo "  Site URL: $APP_URL"
echo "  Redirect: ${APP_URL}/**"
echo ""
echo "Production env checklist (Vercel → Settings → Environment Variables):"
echo "  Required: NEXT_PUBLIC_SUPABASE_*, SUPABASE_SERVICE_ROLE_KEY, SUPER_ADMIN_EMAILS, NEXT_PUBLIC_APP_URL"
echo "  Integrations: ERP_API_KEY, ZAPIER_WEBHOOK_URL, SMTP_*, IMAP_*, CLICKUP_API_TOKEN"
echo "  Seed Canclini warehouse stock: node scripts/seed-canclini-inventory.mjs"
