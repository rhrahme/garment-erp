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

echo "→ Deploying to production..."
$VERCEL --prod --yes

echo ""
echo "Done. Open: https://garment-erp-eta.vercel.app/login"
echo "Then in Supabase → Authentication → URL Configuration:"
echo "  Site URL: $APP_URL"
echo "  Redirect: ${APP_URL}/**"
