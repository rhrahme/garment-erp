#!/usr/bin/env bash
# Push SMTP_* from .env.local + smtp-secret.local.json to Vercel Production, then redeploy.
# Requires: Node/npm, `vercel login`, and this repo linked to garment-erp.
#
# Usage:
#   ./scripts/set-vercel-smtp-env.sh           # set env vars only
#   ./scripts/set-vercel-smtp-env.sh --deploy  # set env vars + vercel --prod
#
# Manual fallback (Vercel dashboard → garment-erp → Settings → Environment Variables → Production):
#   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_FROM_NAME
#   Then Redeploy latest production deployment.
set -euo pipefail
cd "$(dirname "$0")/.."

DEPLOY=false
if [ "${1:-}" = "--deploy" ]; then
  DEPLOY=true
fi

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

ensure_vercel_link() {
  mkdir -p .vercel
  if [ ! -f .vercel/project.json ]; then
    cat > .vercel/project.json << 'JSON'
{
  "projectId": "prj_HjwNm3sqdbkgowt7edX8pl4YaE0v",
  "orgId": "team_0M8KD0UxgfH3aHwShMwslidK"
}
JSON
    echo "→ Wrote .vercel/project.json (garment-erp)"
  fi
}

echo "→ Checking Vercel login..."
if ! $VERCEL whoami >/dev/null 2>&1; then
  echo "   Not logged in. Run: $VERCEL login"
  exit 1
fi
echo "   Logged in as: $($VERCEL whoami)"

ensure_vercel_link
$VERCEL link --yes 2>/dev/null || true

set_vercel_env() {
  local key="$1"
  local value="$2"
  $VERCEL env rm "$key" production -y >/dev/null 2>&1 || true
  printf '%s' "$value" | $VERCEL env add "$key" production
}

SMTP_PASS_VAL="$(read_smtp_pass)"
if [ -z "$SMTP_PASS_VAL" ]; then
  echo "SMTP password missing: set SMTP_PASS in .env.local or smtp-secret.local.json"
  exit 1
fi

for pair in   "SMTP_HOST|$(read_env SMTP_HOST)"   "SMTP_PORT|$(read_env SMTP_PORT)"   "SMTP_SECURE|$(read_env SMTP_SECURE)"   "SMTP_USER|$(read_env SMTP_USER)"   "SMTP_PASS|$SMTP_PASS_VAL"   "SMTP_FROM|$(read_env SMTP_FROM)"   "SMTP_FROM_NAME|$(read_env SMTP_FROM_NAME)"; do
  key="${pair%%|*}"
  val="${pair#*|}"
  if [ -z "$val" ]; then
    echo "Missing $key (check .env.local)"
    exit 1
  fi
  echo "→ Setting Vercel production env: $key"
  set_vercel_env "$key" "$val"
done

echo "→ All SMTP production env vars set."

if [ "$DEPLOY" = true ]; then
  echo "→ Deploying to production..."
  $VERCEL --prod --yes
  echo "→ Done. Verify: curl -sS https://erp.hagan.pro/api/v1/health"
else
  echo "→ Redeploy required for changes to apply. Run:"
  echo "     $0 --deploy"
  echo "   or redeploy from Vercel dashboard."
fi
