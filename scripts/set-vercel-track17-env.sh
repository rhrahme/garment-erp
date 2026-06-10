#!/usr/bin/env bash
# Push TRACK17_API_KEY from .env.local (+ optional track17-secret.local.json) to Vercel Production.
# Requires: Node/npm, `vercel login`, and this repo linked to garment-erp-kvsf.
#
# Usage:
#   ./scripts/set-vercel-track17-env.sh           # set env var only
#   ./scripts/set-vercel-track17-env.sh --deploy  # set env var + vercel --prod
#
# Manual fallback (Vercel dashboard → garment-erp-kvsf → Settings → Environment Variables → Production):
#   TRACK17_API_KEY
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

read_track17_key() {
  local from_env
  from_env="$(read_env TRACK17_API_KEY 2>/dev/null || true)"
  if [ -n "$from_env" ]; then
    printf '%s' "$from_env"
    return
  fi
  if [ -f track17-secret.local.json ]; then
    python3 -c "import json; print(json.load(open('track17-secret.local.json')).get('api_key','').strip())"
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

TRACK17_KEY_VAL="$(read_track17_key)"
if [ -z "$TRACK17_KEY_VAL" ]; then
  echo "TRACK17_API_KEY missing: set in .env.local or track17-secret.local.json"
  exit 1
fi

echo "→ Setting Vercel production env: TRACK17_API_KEY"
set_vercel_env "TRACK17_API_KEY" "$TRACK17_KEY_VAL"

echo "→ TRACK17 production env var set."

redeploy_latest_production() {
  local latest_url
  latest_url="$($VERCEL ls garment-erp-kvsf --prod 2>/dev/null | head -1 | tr -d '[:space:]')"
  if [ -z "$latest_url" ]; then
    echo "→ Could not resolve latest production deployment; run redeploy from Vercel dashboard."
    return 1
  fi
  echo "→ Redeploying latest production ($latest_url) to apply env vars..."
  $VERCEL redeploy "$latest_url"
}

if [ "$DEPLOY" = true ]; then
  redeploy_latest_production
  echo "→ Done. Verify (requires login): GET https://erp.hagan.pro/api/shipments/sync → {\"configured\":true}"
else
  echo "→ Redeploy required for changes to apply. Run:"
  echo "     $0 --deploy"
  echo "   or redeploy from Vercel dashboard."
fi
