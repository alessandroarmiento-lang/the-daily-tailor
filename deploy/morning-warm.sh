#!/bin/bash
# Warm today's Daily Tailor edition (Mail / Reminders / Calendar / meteo / news).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${DAILY_TAILOR_PORT:-3847}"
URL="http://127.0.0.1:${PORT}/api/morning-warm?force=1"

export PATH="${HOME}/.local/node/bin:/usr/local/bin:/opt/homebrew/bin:${PATH}"

cd "$ROOT"

# Ensure Next is up (idempotent if already listening).
if ! curl -fsS -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/"; then
  nohup npm run dev -- --port "$PORT" >/tmp/daily-tailor-dev.log 2>&1 &
  for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/"; then
      break
    fi
    sleep 1
  done
fi

curl -fsS --max-time 240 "$URL"
echo
# Also hit the sheet so SSR paths are warm.
curl -fsS -o /dev/null --max-time 120 "http://127.0.0.1:${PORT}/" || true
