#!/usr/bin/env bash
# First-time / repeat deploy helpers for Fly.io.
# Does not create accounts. Stops with exact commands if flyctl is missing or not logged in.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
APP="${FLY_APP:-the-daily-tailor}"
REGION="${FLY_REGION:-mxp}"

if command -v flyctl >/dev/null 2>&1; then
  FLY=(flyctl)
elif command -v fly >/dev/null 2>&1; then
  FLY=(fly)
else
  cat <<EOF
Fly CLI non installato su questa macchina.

1) Installa:
   curl -L https://fly.io/install.sh | sh
   # oppure: brew install flyctl

2) Login (apre il browser):
   fly auth login

3) Poi rilancia:
   ./deploy/fly/deploy.sh
EOF
  exit 1
fi

if ! "${FLY[@]}" auth whoami >/dev/null 2>&1; then
  cat <<EOF
Fly CLI presente ma non autenticato.

Esegui:
  ${FLY[*]} auth login

Poi:
  ./deploy/fly/deploy.sh
EOF
  exit 1
fi

echo "Authenticated as: $("${FLY[@]}" auth whoami)"
echo "App=$APP region=$REGION"

if ! "${FLY[@]}" apps list 2>/dev/null | grep -q "$APP"; then
  echo "Creating app $APP (may fail if name taken — edit fly.toml app=)…"
  "${FLY[@]}" apps create "$APP" --org personal || true
fi

if ! "${FLY[@]}" volumes list --app "$APP" 2>/dev/null | grep -q editions_data; then
  echo "Creating volume editions_data (1GB) in ${REGION}…"
  "${FLY[@]}" volumes create editions_data --app "$APP" --region "$REGION" --size 1 -y
fi

echo "Importing secrets from .env.local (names only logged)…"
./deploy/fly/set-secrets.sh

echo "Deploying…"
"${FLY[@]}" deploy --app "$APP" --remote-only

echo
echo "Verify warm:"
echo "  ${FLY[*]} ssh console --app $APP -C \"curl -fsS 'http://127.0.0.1:8080/api/morning-warm?force=1'\""
echo "Public URL:"
echo "  https://${APP}.fly.dev/"
echo "Edition JSON:"
echo "  https://${APP}.fly.dev/api/edition/today"
