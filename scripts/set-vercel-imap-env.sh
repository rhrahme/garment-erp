#!/usr/bin/env bash
# Push IMAP_* from .env.local + imap-secret.local.json to Vercel Production, then redeploy.
# Requires: Node/npm, `vercel login`, and this repo linked to garment-erp-kvsf.
#
# Usage:
#   ./scripts/set-vercel-imap-env.sh           # set env vars only
#   ./scripts/set-vercel-imap-env.sh --deploy  # set env vars + vercel --prod
#
# Manual fallback (Vercel dashboard → garment-erp-kvsf → Settings → Environment Variables → Production):
#   IMAP_HOST, IMAP_PORT, IMAP_SECURE, IMAP_USER, IMAP_PASS
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

read_imap_pass() {
  local from_env
  from_env="$(read_env IMAP_PASS 2>/dev/null || true)"
  if [ -n "$from_env" ]; then
    printf '%s' "$from_env"
    return
  fi
  if [ -f imap-secret.local.json ]; then
    python3 -c "import json; print(json.load(open('imap-secret.local.json')).get('password','').strip())"
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
  if [ -x "$HOME/.npm/_npx/67eb4586ca667318/node_modules/.bin/vercel" ]; then
    echo "$HOME/.npm/_npx/67eb4586ca667318/node_modules/.bin/vercel"
    return
  fi
  echo ""
}

NPM="$(find_npm)"
if [ -z "$NPM" ]; then
  echo "Node/npm not found. Install from https://nodejs.org then run this again."
  exit 1
fi

if [[ "$NPM" == *vercel ]]; then
  VERCEL="$NPM"
else
  VERCEL="$NPM exec -- vercel"
fi

ensure_vercel_link() {
  mkdir -p .vercel
  if [ ! -f .vercel/project.json ]; then
    cat > .vercel/project.json << 'JSON'
{
  "projectId": "prj_caq1Uw17pYHmpoVP0rQabKfeR8H6",
  "orgId": "team_0M8KD0UxgfH3aHwShMwslidK"
}
JSON
    echo "→ Wrote .vercel/project.json (garment-erp-kvsf)"
  fi
}

echo "→ Checking Vercel login..."
if ! $VERCEL whoami >/dev/null 2>&1; then
  echo "   Not logged in. Run: $VERCEL login"
  exit 1
fi
echo "   Logged in as: $($VERCEL whoami)"

ensure_vercel_link
if [ ! -f .vercel/project.json ]; then
  $VERCEL link --yes 2>/dev/null || true
fi

set_vercel_env() {
  local key="$1"
  local value="$2"
  $VERCEL env rm "$key" production -y >/dev/null 2>&1 || true
  printf '%s' "$value" | $VERCEL env add "$key" production
}

IMAP_PASS_VAL="$(read_imap_pass)"
if [ -z "$IMAP_PASS_VAL" ]; then
  echo "IMAP password missing: set IMAP_PASS in .env.local or imap-secret.local.json"
  exit 1
fi

IMAP_HOST_VAL="$(read_env IMAP_HOST 2>/dev/null || true)"
IMAP_PORT_VAL="$(read_env IMAP_PORT 2>/dev/null || true)"
IMAP_SECURE_VAL="$(read_env IMAP_SECURE 2>/dev/null || true)"
IMAP_USER_VAL="$(read_env IMAP_USER 2>/dev/null || true)"

IMAP_HOST_VAL="${IMAP_HOST_VAL:-imap.gmail.com}"
IMAP_PORT_VAL="${IMAP_PORT_VAL:-993}"
IMAP_SECURE_VAL="${IMAP_SECURE_VAL:-true}"

if [ -z "$IMAP_USER_VAL" ]; then
  IMAP_USER_VAL="$(python3 -c "import json; print(json.load(open('src/data/suppliers/contacts.json')).get('inbox_scan_email','').strip())" 2>/dev/null || true)"
fi

if [ -z "$IMAP_USER_VAL" ]; then
  echo "Missing IMAP_USER (check .env.local or inbox_scan_email in contacts.json)"
  exit 1
fi

for pair in \
  "IMAP_HOST|$IMAP_HOST_VAL" \
  "IMAP_PORT|$IMAP_PORT_VAL" \
  "IMAP_SECURE|$IMAP_SECURE_VAL" \
  "IMAP_USER|$IMAP_USER_VAL" \
  "IMAP_PASS|$IMAP_PASS_VAL"; do
  key="${pair%%|*}"
  val="${pair#*|}"
  if [ -z "$val" ]; then
    echo "Missing $key"
    exit 1
  fi
  echo "→ Setting Vercel production env: $key"
  set_vercel_env "$key" "$val"
done

echo "→ All IMAP production env vars set."

if [ "$DEPLOY" = true ]; then
  echo "→ Deploying to production..."
  $VERCEL --prod --yes
  echo "→ Done. Verify: curl -sS https://erp.hagan.pro/api/email/scan-inbox (requires login)"
else
  echo "→ Redeploy required for changes to apply. Run:"
  echo "     $0 --deploy"
  echo "   or redeploy from Vercel dashboard."
fi
