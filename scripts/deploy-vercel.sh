#!/usr/bin/env bash
#
# Deploys Sanjeevani to Vercel.
#
#   ./scripts/deploy-vercel.sh <vercel-token>
#
# Requires Node 20.19+ and nothing else — it uses `npx vercel`.
# Create the token at https://vercel.com/account/settings/tokens, scoped to the
# team, and revoke it when this finishes.
#
# ── What is already done ─────────────────────────────────────────────────────
#
# Both projects exist, both production domains are assigned, and every
# environment variable is set — including the two that point the pieces at each
# other. This script only uploads source and builds. It reads no secrets and
# writes none.
#
#     https://sanjeevani-voice.vercel.app        the app people use
#     https://sanjeevani-api-alpha.vercel.app    the API it proxies to
#
# ── Why the API goes first ───────────────────────────────────────────────────
#
# Next.js evaluates `rewrites()` at build time, so the web app's proxy target is
# baked in when it is built. Building the web app before the API answers would
# still succeed — and would ship an app whose every request 404s.
#
# ── What it deliberately does not do ─────────────────────────────────────────
#
# It never touches the database and never runs migrations. A deploy that can
# change a schema is a deploy that can change one by accident.
set -euo pipefail

TOKEN="${1:-${VERCEL_TOKEN:-}}"
if [ -z "$TOKEN" ]; then
  echo "usage: $0 <vercel-token>" >&2
  echo "  create one at https://vercel.com/account/settings/tokens (team: fest)" >&2
  exit 1
fi

export VERCEL_ORG_ID="team_ohcUl0XDCTJmXKkZETkWI6uM"
API_PROJECT_ID="prj_S8PlZJCUOUuNvCMaaKpgvFNYYoKM"
WEB_PROJECT_ID="prj_8qcM1WwEfYToyeu8oCiMNU8mA2VW"

API_URL="https://sanjeevani-api-alpha.vercel.app"
WEB_URL="https://sanjeevani-voice.vercel.app"

VERCEL="npx --yes vercel@latest"
cd "$(dirname "$0")/.."

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

deploy() {
  VERCEL_PROJECT_ID="$1" $VERCEL deploy --prod --yes --token="$TOKEN"
}

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

Everything above should read 200.

  /health      200 but /health/ready 503
               The API is running but cannot reach Postgres — almost
               certainly the pooler hostname in DATABASE_URL. It can be
               corrected and redeployed remotely; no rerun needed here.

Now revoke the token: https://vercel.com/account/settings/tokens
EOF
