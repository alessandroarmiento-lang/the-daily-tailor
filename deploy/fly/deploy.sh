#!/usr/bin/env bash
# Deploy The Daily Tailor to Fly.io.
#
# Auth (any one is enough):
#   - FLY_API_TOKEN in the environment (Cloud Agent secret / CI)
#   - flyctl already logged in interactively (Mac)
#
# Cloud / CI: skip importing .env.local unless present — app secrets already live on Fly.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
APP="${FLY_APP:-the-daily-tailor}"
REGION="${FLY_REGION:-fra}"

export PATH="${HOME}/.fly/bin:/usr/local/bin:${PATH:-}"

if command -v flyctl >/dev/null 2>&1; then
  FLY=(flyctl)
elif command -v fly >/dev/null 2>&1; then
  FLY=(fly)
else
  echo "Fly CLI missing — installing…"
  curl -fsSL https://fly.io/install.sh | sh
  export FLYCTL_INSTALL="${HOME}/.fly"
  export PATH="${FLYCTL_INSTALL}/bin:${PATH}"
  FLY=(flyctl)
fi

if [[ -z "${FLY_API_TOKEN:-}" ]]; then
  if ! "${FLY[@]}" auth whoami >/dev/null 2>&1; then
    cat <<EOF
Fly non autenticato.

Opzione A (definitiva, Cloud Agent / CI — una volta):
  1) sul Mac: fly tokens create deploy -x 999999h
  2) salva il token come secret FLY_API_TOKEN nell'ambiente Cloud Agent
  3) e come GitHub Actions secret FLY_API_TOKEN (deploy automatico su main)

Opzione B (solo questa macchina):
  fly auth login
  poi: ./deploy/fly/deploy.sh
EOF
    exit 1
  fi
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

ENV_FILE="${ROOT}/.env.local"
if [[ -f "$ENV_FILE" ]]; then
  echo "Importing secrets from .env.local (names only logged)…"
  ./deploy/fly/set-secrets.sh "$ENV_FILE"
else
  echo "No .env.local here — leaving existing Fly app secrets unchanged."
fi

echo "Deploying…"
"${FLY[@]}" deploy --app "$APP" --remote-only

echo
echo "Verify warm:"
echo "  ${FLY[*]} ssh console --app $APP -C \"curl -fsS 'http://127.0.0.1:8080/api/morning-warm?force=1'\""
echo "Public URL:"
echo "  https://${APP}.fly.dev/"
echo "Edition JSON:"
echo "  https://${APP}.fly.dev/api/edition/today"
