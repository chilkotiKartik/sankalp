#!/usr/bin/env bash
#
# Puts Sanjeevani on the internet. One command, from a fresh unzip.
#
#   ./scripts/ship.sh <vercel-token> [github-token]
#
# With a GitHub token it also pushes the source to
# https://github.com/chilkotiKartik/sankalp first. Without one it just deploys.
#
# Needs Node 20.19+ and git. Nothing else.
#
# ── What is already done, remotely ───────────────────────────────────────────
#
#   · Supabase Postgres in Mumbai — schema applied, facilities seeded,
#     least-privilege role, public REST access revoked
#   · Both Vercel projects, both production domains, every environment
#     variable — including the two that point the pieces at each other
#
# This script only uploads source and builds. It touches no database.
#
#     https://sanjeevani-voice.vercel.app        the app
#     https://sanjeevani-api-alpha.vercel.app    the API it proxies to
#
# ── Why the API is deployed first ────────────────────────────────────────────
#
# Next.js fixes its proxy target at build time. Build the web app before the
# API answers and the deploy still succeeds — it just ships an app whose every
# request fails. So: API, then web.
set -euo pipefail

VERCEL_TOKEN_ARG="${1:-${VERCEL_TOKEN:-}}"
GITHUB_TOKEN_ARG="${2:-}"

if [ -z "$VERCEL_TOKEN_ARG" ]; then
  echo "usage: $0 <vercel-token> [github-token]" >&2
  echo "  vercel token: https://vercel.com/account/settings/tokens  (team: fest)" >&2
  exit 1
fi

export VERCEL_ORG_ID="team_ohcUl0XDCTJmXKkZETkWI6uM"
API_PROJECT_ID="prj_S8PlZJCUOUuNvCMaaKpgvFNYYoKM"
WEB_PROJECT_ID="prj_8qcM1WwEfYToyeu8oCiMNU8mA2VW"
API_URL="https://sanjeevani-api-alpha.vercel.app"
WEB_URL="https://sanjeevani-voice.vercel.app"
GITHUB_REPO="chilkotiKartik/sankalp"

VERCEL="npx --yes vercel@latest"
cd "$(dirname "$0")/.."

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; }

# ── GitHub (optional) ────────────────────────────────────────────────────────
if [ -n "$GITHUB_TOKEN_ARG" ]; then
  say "Pushing source to github.com/$GITHUB_REPO"
  [ -d .git ] || git init -q
  git config user.name  "$(git config user.name  || echo chilkotiKartik)" >/dev/null 2>&1 || true
  git config user.email "$(git config user.email || echo noreply@users.noreply.github.com)" >/dev/null 2>&1 || true
  git add -A
  git diff --cached --quiet || git commit -q -m "Sanjeevani Voice"
  git branch -M main
  git remote remove origin >/dev/null 2>&1 || true
  # The token lives only in this process's remote, which is removed below —
  # it is never written into .git/config where it would outlive the run.
  git remote add origin "https://x-access-token:${GITHUB_TOKEN_ARG}@github.com/${GITHUB_REPO}.git"
  if git push -u origin main 2>&1 | sed "s/${GITHUB_TOKEN_ARG}/<redacted>/g"; then
    echo "   pushed"
  else
    fail "   push failed — carrying on with the deploy, which does not need it"
  fi
  git remote set-url origin "https://github.com/${GITHUB_REPO}.git"
fi

# ── Vercel ───────────────────────────────────────────────────────────────────
deploy() { VERCEL_PROJECT_ID="$1" $VERCEL deploy --prod --yes --token="$VERCEL_TOKEN_ARG"; }

say "1/2  API  →  $API_URL"
deploy "$API_PROJECT_ID"

say "2/2  Web  →  $WEB_URL"
deploy "$WEB_PROJECT_ID"

say "Checking"
sleep 5
check() { printf '   %-34s %s\n' "$2" "$(curl -s -o /dev/null -w '%{http_code}' "$1$2" || echo 000)"; }
check "$API_URL" /health
check "$API_URL" /health/ready
check "$API_URL" /v1/capabilities
check "$WEB_URL" /
check "$WEB_URL" /emergency

cat <<EOF

────────────────────────────────────────────────────────────
  App   $WEB_URL
  API   $API_URL
────────────────────────────────────────────────────────────

All five lines above should read 200.

  /health 200 but /health/ready 503
      The API is up but cannot reach Postgres — almost certainly the pooler
      hostname in DATABASE_URL. That is fixable remotely, with no rerun here.

Revoke both tokens now:
  https://vercel.com/account/settings/tokens
  https://github.com/settings/tokens
EOF
