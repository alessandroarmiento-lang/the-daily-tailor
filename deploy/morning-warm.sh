#!/bin/bash
# Warm today's Daily Tailor edition (Mail / Reminders / Calendar / meteo / news).
# One script for manual runs and for launchd. Logs, and starts the app if it is down.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${DAILY_TAILOR_PORT:-3847}"
BASE_URL="${DAILY_TAILOR_BASE_URL:-http://127.0.0.1:${PORT}}"
URL="${BASE_URL}/api/morning-warm?force=1"
LOG_DIR="${DAILY_TAILOR_LOG_DIR:-$HOME/Library/Logs/the-daily-tailor}"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/morning-warm.log"

export PATH="${HOME}/.local/node/bin:/usr/local/bin:/opt/homebrew/bin:${PATH}"

cd "$ROOT"

{
  echo "---- $(date -u '+%Y-%m-%dT%H:%M:%SZ') warm start ----"
  if ! curl -fsS -o /dev/null --max-time 2 "${BASE_URL}/"; then
    nohup npm run dev -- --port "$PORT" >/tmp/daily-tailor-dev.log 2>&1 &
    for _ in $(seq 1 60); do
      if curl -fsS -o /dev/null --max-time 2 "${BASE_URL}/"; then
        break
      fi
      sleep 1
    done
  fi
  curl -fsS --max-time 240 "$URL"
  echo
  curl -fsS -o /dev/null --max-time 120 "${BASE_URL}/" || true
  echo "---- done ----"
} 2>&1 | tee -a "$LOG"
