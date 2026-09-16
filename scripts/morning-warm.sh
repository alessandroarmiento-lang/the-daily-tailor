#!/usr/bin/env bash
# Generate today's Daily Tailor edition at 06:00 Europe/Rome (launchd).
# Requires the Next app listening on BASE_URL (default http://127.0.0.1:3847).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${DAILY_TAILOR_BASE_URL:-http://127.0.0.1:3847}"
LOG_DIR="${DAILY_TAILOR_LOG_DIR:-$HOME/Library/Logs/the-daily-tailor}"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/morning-warm.log"

{
  echo "---- $(date -u '+%Y-%m-%dT%H:%M:%SZ') warm start ----"
  curl -fsS --max-time 120 "${BASE_URL}/api/morning-warm?force=1"
  echo
  echo "---- done ----"
} >>"$LOG" 2>&1
