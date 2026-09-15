#!/usr/bin/env bash
# Compile EventKit helpers into scripts/macos/bin/ (local Mac only).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="$ROOT/scripts/macos/bin"
mkdir -p "$BIN"

swiftc -O \
  -o "$BIN/fetch-reminders-eventkit" \
  "$ROOT/scripts/macos/fetch-reminders-eventkit.swift" \
  -framework EventKit -framework Foundation

swiftc -O \
  -o "$BIN/fetch-calendar-eventkit" \
  "$ROOT/scripts/macos/fetch-calendar-eventkit.swift" \
  -framework EventKit -framework Foundation

echo "Built:"
ls -la "$BIN"
"$BIN/fetch-reminders-eventkit" 5 | head -c 200; echo
"$BIN/fetch-calendar-eventkit" 4 | head -c 300; echo
