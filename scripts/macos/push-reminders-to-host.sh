#!/usr/bin/env bash
# Push open Apple Reminders (EventKit) from this Mac to the always-on host.
# Same endpoint the iPhone Shortcut uses — handy fallback / test while the Mac is awake.
# Token is read from .env.local and never printed or passed through argv.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.local}"
HOST="${INGEST_HOST:-https://the-daily-tailor.fly.dev}"
URL="$HOST/api/reminders/ingest"
POOL="${REMINDERS_POOL:-60}"
BIN="$ROOT/scripts/macos/bin/fetch-reminders-eventkit"

if [[ "${1:-}" == "--warm" ]]; then
  URL="$URL?warm=1"
fi

if [[ ! -x "$BIN" ]]; then
  echo "EventKit tool mancante: esegui ./scripts/macos/build-eventkit-tools.sh" >&2
  exit 1
fi

TOKEN="${REMINDERS_INGEST_TOKEN:-}"
if [[ -z "$TOKEN" && -f "$ENV_FILE" ]]; then
  TOKEN="$(python3 - "$ENV_FILE" <<'PY'
import sys
from pathlib import Path

for line in Path(sys.argv[1]).read_text(encoding="utf-8").splitlines():
    s = line.strip()
    if s.startswith("REMINDERS_INGEST_TOKEN=") and not s.startswith("#"):
        print(s.partition("=")[2].strip().strip('"').strip("'"))
        break
PY
)"
fi

if [[ -z "$TOKEN" ]]; then
  echo "REMINDERS_INGEST_TOKEN assente in $ENV_FILE (o nell'ambiente)." >&2
  exit 1
fi

PAYLOAD="$(mktemp)"
EVENTKIT_OUT="$(mktemp)"
trap 'rm -f "$PAYLOAD" "$EVENTKIT_OUT"' EXIT

"$BIN" "$POOL" > "$EVENTKIT_OUT"

python3 - "$EVENTKIT_OUT" "$PAYLOAD" <<'PY'
import json
import sys
from pathlib import Path

raw = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
if not raw.get("ok"):
    print(raw.get("error", "EventKit fetch fallito"), file=sys.stderr)
    sys.exit(1)

items = [
    {
        "id": r.get("id") or "",
        "title": r.get("title") or "",
        "listName": r.get("listName") or "Promemoria",
        "dueAt": r.get("dueAt"),
        "notes": r.get("notes") or "",
        "priority": r.get("priority") or "none",
    }
    for r in raw.get("items", [])
    if (r.get("title") or "").strip()
]

Path(sys.argv[2]).write_text(
    json.dumps({"device": "Mac", "reminders": items}), encoding="utf-8"
)
print(f"{len(items)} promemoria aperti da EventKit", file=sys.stderr)
PY

# curl --config - keeps the token out of the process list.
printf 'header = "X-Ingest-Token: %s"\n' "$TOKEN" |
  curl --config - \
    --silent --show-error --fail-with-body --max-time 240 \
    -X POST "$URL" \
    -H 'Content-Type: application/json' \
    --data-binary "@$PAYLOAD"
echo
