#!/usr/bin/env bash
# Start the local Daily Tailor web app (port 3847) and open it in the browser.
# Fallback: production host if the local server does not come up.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${DAILY_TAILOR_PORT:-3847}"
LOCAL_URL="http://127.0.0.1:${PORT}/"
PROD_URL="https://the-daily-tailor.fly.dev/"
LOG_DIR="${HOME}/Library/Logs/the-daily-tailor"
LOG_FILE="${LOG_DIR}/web-app.log"

export PATH="${HOME}/.local/node/bin:${HOME}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

up() {
  curl -fsS -m 2 -o /dev/null "$1" 2>/dev/null
}

open_url() {
  /usr/bin/open "$1"
}

if up "$LOCAL_URL"; then
  open_url "$LOCAL_URL"
  exit 0
fi

NODE="$(command -v node || true)"
if [[ -z "$NODE" || ! -x "$NODE" ]]; then
  open_url "$PROD_URL"
  exit 0
fi

NEXT_BIN="${ROOT}/node_modules/next/dist/bin/next"
if [[ ! -f "$NEXT_BIN" ]]; then
  if command -v npm >/dev/null 2>&1; then
    mkdir -p "$LOG_DIR"
    (cd "$ROOT" && npm install) >>"$LOG_FILE" 2>&1 || true
  fi
fi

if [[ ! -f "$NEXT_BIN" ]]; then
  open_url "$PROD_URL"
  exit 0
fi

mkdir -p "$LOG_DIR"
cd "$ROOT"
nohup "$NODE" "$NEXT_BIN" dev --port "$PORT" --hostname 127.0.0.1 >>"$LOG_FILE" 2>&1 &

for _ in $(seq 1 40); do
  if up "$LOCAL_URL"; then
    open_url "$LOCAL_URL"
    exit 0
  fi
  sleep 0.25
done

open_url "$PROD_URL"
