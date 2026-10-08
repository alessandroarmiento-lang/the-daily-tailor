#!/usr/bin/env bash
# Build + sign both Reminders → The Daily Tailor shortcuts on the Mac Desktop.
# Opens the signed files so Alessandro can tap Aggiungi once per file.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOST="${INGEST_HOST:-https://the-daily-tailor.fly.dev}"

python3 "$ROOT/scripts/macos/build-reminders-shortcut.py" \
  --host "$HOST" \
  --with-memo \
  --open \
  "$@"

echo
echo "Poi (iPhone): Automazione 05:55 → Esegui comando rapido → Invia memo a TDT."
echo "Prova a mano: apri «Invia promemoria al giornale» → notifica «Promemoria inviati»."
