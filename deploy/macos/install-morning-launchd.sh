#!/bin/bash
# Install 06:00 launchd job for The Daily Tailor morning warm.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLIST_SRC="$ROOT/deploy/macos/com.alessandro.the-daily-tailor.morning.plist"
DEST="$HOME/Library/LaunchAgents/com.alessandro.the-daily-tailor.morning.plist"

mkdir -p "$HOME/Library/LaunchAgents"
# Rewrite ProgramArguments path to this checkout.
python3 - <<PY
from pathlib import Path
root = Path("$ROOT")
src = Path("$PLIST_SRC")
dest = Path("$DEST")
text = src.read_text()
text = text.replace(
    "/Users/alessandroarmiento/Desktop/the-daily-tailor",
    str(root),
)
dest.write_text(text)
print(f"Wrote {dest}")
PY

launchctl bootout "gui/$(id -u)/com.alessandro.the-daily-tailor.morning" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DEST"
launchctl enable "gui/$(id -u)/com.alessandro.the-daily-tailor.morning" 2>/dev/null || true
echo "Installed. Runs daily at 06:00 local. Logs: /tmp/daily-tailor-morning.log"
